// /api/property-lookup.js — Property lookup via Anthropic Claude with web search

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
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for this property: ${query}

Visit the listing page on Zillow, Realtor.com, or Redfin. Return ONLY JSON:
{"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","photos":["url1","url2"],"listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":""}`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ success: false, error: 'API error: ' + response.status, detail: errText });
    }

    const data = await response.json();
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
    return res.status(200).json({ success: true, property });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
