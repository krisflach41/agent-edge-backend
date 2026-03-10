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

  const searchParts = [];
  if (mlsId) searchParts.push(`MLS #${mlsId}`);
  if (address) searchParts.push(address);
  const searchQuery = searchParts.join(' ') + ' property listing';

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
        max_tokens: 4000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search'
          }
        ],
        messages: [
          {
            role: 'user',
            content: `I need complete property listing data. Search for: ${searchQuery}

STEP 1: Search for the property on Google. Look for listings on Zillow, Realtor.com, or Redfin.

STEP 2: Visit the actual listing page to get full details. You MUST visit the listing page URL to get photos and complete information.

STEP 3: From the listing page, extract ALL photo URLs. Property listing photos are hosted on CDNs like:
- Zillow: photos.zillowstatic.com 
- Realtor.com: ap.rdcpix.com
- Redfin: ssl.cdn-redfin.com
Look in the page source for image URLs. Get every property photo URL you can find.

STEP 4: Also extract: lot size, year built, full property description, listing agent name, listing status, and the listing page URL.

Return ONLY a JSON object with this exact structure — no other text, no markdown fences, no explanation:

{"address":"street address","city":"city","state":"ST","zip":"zipcode","price":640000,"beds":4,"baths":3.5,"sqft":3186,"lotSize":8500,"yearBuilt":1998,"description":"Full property description from the listing","photos":["https://full-url-to-photo1.jpg","https://full-url-to-photo2.jpg"],"listingAgent":"Agent Name","mlsId":"MLS number","propertyType":"Single Family","status":"Active","source":"zillow or realtor.com or redfin","url":"https://full-listing-page-url"}

The photos array is CRITICAL. I need actual image URLs, not placeholder text. If you cannot find photo URLs, set photos to an empty array. Do NOT make up URLs.`
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ success: false, error: 'Anthropic API error: ' + response.status, detail: errText });
    }

    const data = await response.json();

    // Extract text response
    let textContent = '';
    for (const block of data.content || []) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    if (!textContent) {
      return res.status(200).json({ success: false, error: 'No text response from Claude', raw: data.content });
    }

    // Parse JSON from response
    let jsonStr = textContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
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
