// /api/property-lookup.js — Property lookup with photos via Anthropic Claude web search

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const address = req.query.address || '';
  const mlsId = req.query.mls || '';

  if (!address && !mlsId) {
    return res.status(400).json({ error: 'address or mls parameter required' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const query = [mlsId ? `MLS #${mlsId}` : '', address].filter(Boolean).join(' ');

  try {
    // Step 1: Find the property and get all data including listing page URL
    const resp1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for this property listing: ${query}

Return ONLY JSON with property data:
{"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":"the exact listing page URL on zillow or realtor.com or redfin"}`
        }]
      })
    });

    if (!resp1.ok) {
      const err = await resp1.text();
      return res.status(200).json({ success: false, error: 'API error step 1: ' + resp1.status, detail: err });
    }

    const data1 = await resp1.json();
    let text1 = '';
    for (const block of data1.content || []) {
      if (block.type === 'text') text1 += block.text;
    }

    let property = {};
    try {
      const clean = text1.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) property = JSON.parse(match[0]);
    } catch (e) {
      return res.status(200).json({ success: false, error: 'Could not parse step 1', rawText: text1.substring(0, 300) });
    }

    // Step 2: Use the listing URL to find photos
    const listingUrl = property.url || '';
    let photos = [];

    if (listingUrl && listingUrl.startsWith('http')) {
      try {
        const resp2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [{
              role: 'user',
              content: `Go to this property listing page and find ALL property photo image URLs: ${listingUrl}

I need the actual CDN image URLs for this property's listing photos. These are full URLs to .jpg or .webp images hosted on domains like:
- photos.zillowstatic.com
- ap.rdcpix.com  
- ssl.cdn-redfin.com
- img.cdn-redfin.com

Also try searching for "${property.address || address} ${property.city || ''} ${property.state || ''} property photos" to find image URLs.

Return ONLY a JSON array of photo URLs, nothing else. Example: ["https://photos.zillowstatic.com/abc123.jpg","https://photos.zillowstatic.com/def456.jpg"]

If you truly cannot find any photo URLs, return: []`
            }]
          })
        });

        if (resp2.ok) {
          const data2 = await resp2.json();
          let text2 = '';
          for (const block of data2.content || []) {
            if (block.type === 'text') text2 += block.text;
          }
          
          const clean2 = text2.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const arrMatch = clean2.match(/\[[\s\S]*\]/);
          if (arrMatch) {
            const parsed = JSON.parse(arrMatch[0]);
            if (Array.isArray(parsed)) {
              photos = parsed.filter(u => typeof u === 'string' && u.startsWith('http'));
            }
          }
        }
      } catch (e2) {
        // Photo step failed, continue with what we have
      }
    }

    property.photos = photos;

    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
