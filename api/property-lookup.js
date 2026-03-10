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
    // Get property data via Claude with web search
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: 'You are a JSON API. You search for property listings and return ONLY raw JSON. Never explain, never refuse, never add commentary. Output must start with { and end with }.',
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search: ${query}\nReturn: {"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":""}`
        }]
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      return res.status(200).json({ success: false, error: 'API error: ' + resp.status, detail: err });
    }

    const data = await resp.json();
    let text = '';
    for (const block of data.content || []) {
      if (block.type === 'text') text += block.text;
    }

    if (!text) {
      return res.status(200).json({ success: false, error: 'No response' });
    }

    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(200).json({ success: false, error: 'No JSON', rawText: text.substring(0, 300) });
    }

    const property = JSON.parse(match[0]);

    // Now get photos by fetching the listing page directly
    let photos = [];
    const listingUrl = property.url || '';
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site'
    };

    // Try the listing URL we got
    if (listingUrl && listingUrl.startsWith('http')) {
      try {
        const pageResp = await fetch(listingUrl, { headers: fetchHeaders, redirect: 'follow' });
        if (pageResp.ok) {
          const html = await pageResp.text();
          photos = extractPhotos(html);
        }
      } catch (e) {}
    }

    // If no photos, try constructing Realtor.com URL
    if (photos.length === 0) {
      try {
        const a = (property.address || address).replace(/\s+/g, '-').replace(/[,#]/g, '');
        const c = (property.city || '').replace(/\s+/g, '-');
        const s = property.state || '';
        const z = property.zip || '';
        const rUrl = `https://www.realtor.com/realestateandhomes-detail/${a}_${c}_${s}_${z}`;
        const rResp = await fetch(rUrl, { headers: fetchHeaders, redirect: 'follow' });
        if (rResp.ok) {
          const html = await rResp.text();
          photos = extractPhotos(html);
        }
      } catch (e) {}
    }

    // If no photos, try Zillow
    if (photos.length === 0) {
      try {
        const a = (property.address || address).replace(/\s+/g, '-').replace(/[,#]/g, '');
        const c = (property.city || '').replace(/\s+/g, '-');
        const s = property.state || '';
        const z = property.zip || '';
        const zUrl = `https://www.zillow.com/homedetails/${a}-${c}-${s}-${z}`;
        const zResp = await fetch(zUrl, { headers: fetchHeaders, redirect: 'follow' });
        if (zResp.ok) {
          const html = await zResp.text();
          photos = extractPhotos(html);
        }
      } catch (e) {}
    }

    property.photos = photos.slice(0, 25);
    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}

function extractPhotos(html) {
  const photos = new Set();
  
  // CDN photo patterns
  const patterns = [
    /https?:\/\/ssl\.cdn-redfin\.com\/photo\/[^\s"'<>\\)]+/g,
    /https?:\/\/img\.cdn-redfin\.com\/photo\/[^\s"'<>\\)]+/g,
    /https?:\/\/photos\.zillowstatic\.com\/uncropped_scaled_within_1536_1152\/[^\s"'<>\\)]+/g,
    /https?:\/\/photos\.zillowstatic\.com\/[^\s"'<>\\)]+\.(?:jpg|webp|png)/gi,
    /https?:\/\/ap\.rdcpix\.com\/[^\s"'<>\\)]+/g,
    /https?:\/\/ar\.rdcpix\.com\/[^\s"'<>\\)]+/g
  ];

  for (const p of patterns) {
    const matches = html.match(p) || [];
    for (let m of matches) {
      m = m.replace(/['"\\]/g, '').replace(/&amp;/g, '&');
      if (m.length > 40 && !m.includes('avatar') && !m.includes('logo') && !m.includes('icon') && !m.includes('agent')) {
        photos.add(m);
      }
    }
  }

  // og:image
  const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);
  if (ogMatch && ogMatch[1].startsWith('http')) {
    photos.add(ogMatch[1]);
  }

  // JSON-LD image
  const ldMatch = html.match(/"image"\s*:\s*"(https?:\/\/[^"]+)"/g);
  if (ldMatch) {
    for (const m of ldMatch) {
      const url = m.match(/"(https?:\/\/[^"]+)"/);
      if (url && url[1].length > 40) photos.add(url[1]);
    }
  }

  return [...photos];
}
