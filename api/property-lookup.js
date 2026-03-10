// /api/property-lookup.js — Property lookup via Anthropic Claude web search

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

  // Build multiple search strings for better coverage
  const searches = [];
  if (address && mlsId) {
    searches.push(address + ' MLS ' + mlsId);
    searches.push(address + ' for sale');
  } else if (address) {
    searches.push(address + ' for sale');
    searches.push(address + ' real estate listing');
  } else {
    searches.push('MLS ' + mlsId + ' property listing');
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: 'You are a property data API. You MUST return ONLY a JSON object. No text before it. No text after it. No markdown. No explanation. Start your response with { and end with }. Every field must have a value — use 0 for unknown numbers and "" for unknown strings. NEVER return null.',
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{
          role: 'user',
          content: `Search for this property listing using these queries: "${searches.join('" and "')}"

Search on Zillow, Redfin, and Realtor.com. Combine information from ALL sources you find.

Return this exact JSON structure with EVERY field filled in:
{"address":"full street address","city":"city name","state":"XX","zip":"XXXXX","price":000000,"beds":0,"baths":0.0,"sqft":0000,"lotSize":0,"yearBuilt":0000,"description":"full property description from listing","listingAgent":"agent full name","mlsId":"${mlsId || ''}","propertyType":"Single Family","status":"For Sale","source":"which site had the most data","url":"full URL to best listing page","photos":[]}`
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
      return res.status(200).json({ success: false, error: 'No response from search' });
    }

    const clean = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(200).json({ success: false, error: 'No JSON in response', rawText: textContent.substring(0, 300) });
    }

    try {
      const property = JSON.parse(match[0]);
      // Verify we got real data back, not all empty
      if (property.address || property.price || property.beds) {
        return res.status(200).json({ success: true, property });
      } else {
        return res.status(200).json({ success: false, error: 'Property found but no data returned. Try a different address format.', property });
      }
    } catch (parseErr) {
      return res.status(200).json({ success: false, error: 'JSON parse error: ' + parseErr.message, rawText: textContent.substring(0, 300) });
    }

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
