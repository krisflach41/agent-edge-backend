// /api/property-lookup.js — Property lookup with photos

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
    // Step 1: Get property data
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
          content: `Search for this property: ${query}. Return ONLY JSON: {"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":""}`
        }]
      })
    });

    if (!resp1.ok) {
      const err = await resp1.text();
      return res.status(200).json({ success: false, error: 'Step 1 error: ' + resp1.status, detail: err });
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
      return res.status(200).json({ success: false, error: 'Parse error step 1', rawText: text1.substring(0, 300) });
    }

    // Step 2: Get photos using Zillow's API directly
    // Zillow has a public-ish API for photos that works with zpid or address
    const fullAddress = `${property.address || address}, ${property.city || ''} ${property.state || ''} ${property.zip || ''}`.trim();
    let photos = [];

    // Try Google Custom Search API for images (free tier: 100/day)
    // Actually - try fetching the Redfin/Zillow listing page directly since we have the URL
    const listingUrl = property.url || '';
    
    if (listingUrl) {
      // Try fetching with browser-like headers - some listing pages work from Vercel
      try {
        const pageResp = await fetch(listingUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/'
          },
          redirect: 'follow'
        });

        if (pageResp.ok) {
          const html = await pageResp.text();
          
          // Extract all image URLs from the page that look like property photos
          const imgPatterns = [
            /https?:\/\/ssl\.cdn-redfin\.com\/photo\/[^\s"'<>]+/g,
            /https?:\/\/photos\.zillowstatic\.com\/[^\s"'<>]+/g,
            /https?:\/\/ap\.rdcpix\.com\/[^\s"'<>]+/g,
            /https?:\/\/img\.cdn-redfin\.com\/photo\/[^\s"'<>]+/g,
            /https?:\/\/[^\s"'<>]*\.jpg/gi,
            /https?:\/\/[^\s"'<>]*\.webp/gi
          ];

          for (const pattern of imgPatterns) {
            const matches = html.match(pattern) || [];
            for (const m of matches) {
              const clean = m.replace(/['"\\]/g, '');
              if (clean.includes('photo') || clean.includes('property') || clean.includes('listing') ||
                  clean.includes('cdn-redfin') || clean.includes('zillowstatic') || clean.includes('rdcpix')) {
                if (!clean.includes('avatar') && !clean.includes('logo') && !clean.includes('icon') && 
                    !clean.includes('sprite') && !clean.includes('badge') && clean.length > 50) {
                  photos.push(clean);
                }
              }
            }
          }

          // Also look for og:image meta tag
          const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
          if (ogMatch) photos.unshift(ogMatch[1]);

          // Deduplicate
          photos = [...new Set(photos)];
        }
      } catch (fetchErr) {
        // Page fetch failed, continue
      }
    }

    // If still no photos, try Realtor.com's format (they sometimes work)
    if (photos.length === 0 && (property.address || address)) {
      try {
        const addr = (property.address || address).replace(/\s+/g, '-').replace(/,/g, '');
        const city = (property.city || '').replace(/\s+/g, '-');
        const state = property.state || 'OH';
        const zip = property.zip || '';
        const realtorUrl = `https://www.realtor.com/realestateandhomes-detail/${addr}_${city}_${state}_${zip}`;
        
        const rResp = await fetch(realtorUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html',
            'Referer': 'https://www.google.com/'
          },
          redirect: 'follow'
        });

        if (rResp.ok) {
          const rHtml = await rResp.text();
          const rdcMatches = rHtml.match(/https?:\/\/ap\.rdcpix\.com\/[^\s"'<>]+/g) || [];
          for (const m of rdcMatches) {
            photos.push(m.replace(/['"\\]/g, ''));
          }
          
          const ogMatch = rHtml.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
          if (ogMatch) photos.unshift(ogMatch[1]);
          
          photos = [...new Set(photos)];
        }
      } catch (e) {
        // Realtor fetch failed
      }
    }

    property.photos = photos.slice(0, 25);

    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
