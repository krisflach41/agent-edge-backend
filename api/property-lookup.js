// /api/property-lookup.js — Property lookup using Anthropic Claude with web search
// GET ?address=789+Dorgene+Ln+Cincinnati+OH+45244&mls=1870625

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

  const searchQuery = mlsId
    ? `MLS #${mlsId}${address ? ' ' + address : ''} property listing`
    : `${address} property listing`;

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
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ],
        messages: [
          {
            role: 'user',
            content: `Search for this property listing: ${searchQuery}

Find the actual real estate listing on Realtor.com, Zillow, or Redfin. Extract ALL of the following data and return it as a JSON object ONLY — no other text, no markdown, no explanation, just the raw JSON:

{
  "address": "street address",
  "city": "city",
  "state": "state abbreviation",
  "zip": "zip code",
  "price": numeric price or null,
  "beds": number or null,
  "baths": number or null,
  "sqft": number or null,
  "lotSize": lot size in sqft or null,
  "yearBuilt": year or null,
  "description": "property description text",
  "photos": ["url1", "url2", "url3"],
  "listingAgent": "agent name",
  "mlsId": "MLS number",
  "propertyType": "Single Family, Condo, etc",
  "status": "Active, Pending, Sold, etc",
  "source": "realtor.com or zillow or redfin",
  "url": "full URL to the listing page"
}

CRITICAL: For the photos array, find the actual full-size image URLs from the listing. These are usually hosted on CDN domains like photos.zillowstatic.com, ap.rdcpix.com, ssl.cdn-redfin.com, or similar. Include as many photo URLs as you can find (up to 20). Return ONLY the JSON object, nothing else.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ success: false, error: 'Anthropic API error: ' + response.status, detail: errText });
    }

    const data = await response.json();

    // Extract the text response from Claude
    let textContent = '';
    for (const block of data.content || []) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    if (!textContent) {
      return res.status(200).json({ success: false, error: 'No text response from Claude', raw: data.content });
    }

    // Try to parse the JSON from Claude's response
    // Strip any markdown code fences
    let jsonStr = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Find the JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ success: false, error: 'Could not find JSON in response', rawText: textContent.substring(0, 500) });
    }

    try {
      const property = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, property });
    } catch (parseErr) {
      return res.status(200).json({ success: false, error: 'JSON parse failed: ' + parseErr.message, rawText: textContent.substring(0, 500) });
    }

  } catch (e) {
    return res.status(200).json({ success: false, error: 'Request failed: ' + e.message });
  }
}
