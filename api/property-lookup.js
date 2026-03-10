// /api/property-lookup.js — Debug: see if web_fetch is being used

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
        system: 'You are a JSON API. Output ONLY raw JSON.',
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 3 },
          { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }
        ],
        messages: [{
          role: 'user',
          content: `Search for: ${query}

Find a Zillow, Realtor.com, or Redfin listing page. Then USE THE WEB FETCH TOOL to fetch that listing page URL. From the fetched page content, extract all property photo image URLs.

Return: {"address":"","city":"","state":"","zip":"","price":0,"beds":0,"baths":0,"sqft":0,"lotSize":0,"yearBuilt":0,"description":"","photos":["url1"],"listingAgent":"","mlsId":"","propertyType":"","status":"","source":"","url":""}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(200).json({ success: false, error: 'API error: ' + response.status, detail: err });
    }

    const data = await response.json();
    
    // Log ALL content block types to see what tools were used
    const blockTypes = (data.content || []).map(b => ({
      type: b.type,
      name: b.name || undefined,
      hasContent: !!b.content,
      textPreview: b.type === 'text' ? (b.text || '').substring(0, 200) : undefined,
      errorCode: b.content?.error_code || undefined
    }));

    let textContent = '';
    for (const block of data.content || []) {
      if (block.type === 'text') textContent += block.text;
    }

    let property = null;
    if (textContent) {
      const clean = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { property = JSON.parse(match[0]); } catch(e) {}
      }
    }

    return res.status(200).json({
      success: !!property,
      property: property,
      debug: {
        blockTypes,
        stopReason: data.stop_reason,
        totalBlocks: (data.content || []).length
      }
    });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
