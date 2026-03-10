// /api/property-lookup.js — Property lookup with web_search + web_fetch

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
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-fetch-2025-09-10'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: 'You are a JSON API. Output ONLY a raw JSON object. No explanation, no markdown fences, no text before or after. Start with { end with }.',
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
          { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }
        ],
        messages: [{
          role: 'user',
          content: `Search for this property listing: ${query}

After finding a listing on Zillow, Realtor.com, or Redfin, fetch the actual listing page to get full details and photo URLs.

Photo URLs are in the page HTML on CDN domains like photos.zillowstatic.com, ap.rdcpix.com, ssl.cdn-redfin.com. Extract as many as you can find.

Return: {"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","photos":["url1","url2"],"listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":""}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(200).json({ success: false, error: 'API error: ' + response.status, detail: err });
    }

    const data = await response.json();
    let textContent = '';
    for (const block of data.content || []) {
      if (block.type === 'text') textContent += block.text;
    }

    if (!textContent) {
      return res.status(200).json({ success: false, error: 'No response', contentTypes: (data.content || []).map(b => b.type) });
    }

    const clean = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(200).json({ success: false, error: 'No JSON found', rawText: textContent.substring(0, 500) });
    }

    const property = JSON.parse(match[0]);
    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
