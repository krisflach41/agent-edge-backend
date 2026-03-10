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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Find this property listing: ${query}

Do multiple searches:
1. Search "${query}" to find the listing
2. Search "site:redfin.com ${address || query}" for Redfin listing  
3. Search "site:zillow.com ${address || query}" for Zillow listing

Visit the actual listing page you find. On the listing page look for all property photo URLs in the page content. Photo URLs contain patterns like:
- ssl.cdn-redfin.com/photo/
- photos.zillowstatic.com/
- ap.rdcpix.com/

Return ONLY this JSON — no other text:
{"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"full listing description","photos":["https://actual-cdn-url/photo1.jpg","https://actual-cdn-url/photo2.jpg"],"listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":"listing page url"}

The photos array MUST contain real image URLs from the listing. Search results often contain thumbnail image URLs — include those. Every search result snippet that shows a property image has an image URL — capture it.`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(200).json({ success: false, error: 'API error: ' + response.status, detail: err });
    }

    const data = await response.json();
    
    // Collect photos from search result images too
    let searchPhotos = [];
    for (const block of data.content || []) {
      // Web search results sometimes include image URLs
      if (block.type === 'web_search_tool_result' && block.content) {
        for (const result of block.content) {
          if (result.type === 'web_search_result') {
            // Check for image URLs in the result
            const url = result.url || '';
            if (url.match(/\.(jpg|jpeg|png|webp)/i) || 
                url.includes('cdn-redfin') || 
                url.includes('zillowstatic') || 
                url.includes('rdcpix')) {
              searchPhotos.push(url);
            }
          }
        }
      }
    }

    let textContent = '';
    for (const block of data.content || []) {
      if (block.type === 'text') textContent += block.text;
    }

    if (!textContent) {
      return res.status(200).json({ success: false, error: 'No response text' });
    }

    let jsonStr = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ success: false, error: 'No JSON found', rawText: textContent.substring(0, 300) });
    }

    const property = JSON.parse(jsonMatch[0]);
    
    // Merge any photos found in search results with Claude's extracted photos
    const allPhotos = [...(property.photos || []), ...searchPhotos];
    property.photos = [...new Set(allPhotos)].filter(u => typeof u === 'string' && u.startsWith('http'));

    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
