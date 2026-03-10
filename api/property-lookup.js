// /api/property-lookup.js — Property data lookup via Realtor.com
// GET ?address=789+Dorgene+Ln+Cincinnati+OH+45244

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const address = req.query.address;
  const mlsId = req.query.mls;

  if (!address && !mlsId) {
    return res.status(400).json({ error: 'address or mls parameter required' });
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': 'https://www.google.com/'
  };

  const searchQuery = address || mlsId;
  const slug = searchQuery.replace(/\s+/g, '-').replace(/,/g, '').replace(/[^a-zA-Z0-9-]/g, '');

  try {
    // Try the search/detail page on realtor.com
    const url = `https://www.realtor.com/realestateandhomes-search/${slug}`;
    const resp = await fetch(url, { headers, redirect: 'follow' });

    if (!resp.ok) {
      return res.status(200).json({
        success: false,
        error: `Realtor.com returned ${resp.status} ${resp.statusText}. Try again in a moment.`,
        searchedFor: searchQuery
      });
    }

    const html = await resp.text();

    // Strategy 1: Parse __NEXT_DATA__ embedded JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const props = nextData?.props?.pageProps;

        let propertyData = null;

        // Check for search results
        const results = props?.searchResults?.home_search?.results
          || props?.searchResults?.homes
          || props?.properties;

        if (results && results.length) {
          const listing = results[0];
          const loc = listing.location || {};
          const addr = loc.address || {};
          const desc = listing.description || {};
          const photos = (listing.photos || listing.photo || [])
            .map(p => p.href || p.url || p)
            .filter(p => typeof p === 'string' && p.startsWith('http'));

          propertyData = {
            address: addr.line || addr.street || '',
            city: addr.city || '',
            state: addr.state_code || addr.state || '',
            zip: addr.postal_code || addr.zip || '',
            price: listing.list_price || listing.price || null,
            beds: desc.beds ?? null,
            baths: desc.baths ?? null,
            sqft: desc.sqft ?? null,
            lotSize: desc.lot_sqft ?? null,
            yearBuilt: desc.year_built ?? null,
            description: desc.text || '',
            photos: photos,
            listingAgent: (listing.advertisers || [])[0]?.name || '',
            mlsId: listing.mls_id || listing.property_id || '',
            propertyType: desc.type || '',
            status: listing.status || '',
            source: 'realtor.com',
            url: listing.permalink ? `https://www.realtor.com${listing.permalink}` : resp.url
          };
        }

        // Check for single property detail
        if (!propertyData) {
          const p = props?.property || props?.listing || props?.propertyDetails;
          if (p) {
            const loc = p.location || {};
            const addr = loc.address || {};
            const desc = p.description || {};
            const photos = (p.photos || p.photo || [])
              .map(ph => ph.href || ph.url || ph)
              .filter(ph => typeof ph === 'string' && ph.startsWith('http'));

            propertyData = {
              address: addr.line || addr.street || '',
              city: addr.city || '',
              state: addr.state_code || addr.state || '',
              zip: addr.postal_code || addr.zip || '',
              price: p.list_price || p.price || null,
              beds: desc.beds ?? null,
              baths: desc.baths ?? null,
              sqft: desc.sqft ?? null,
              lotSize: desc.lot_sqft ?? null,
              yearBuilt: desc.year_built ?? null,
              description: desc.text || '',
              photos: photos,
              listingAgent: (p.advertisers || [])[0]?.name || '',
              mlsId: p.mls_id || p.property_id || '',
              propertyType: desc.type || '',
              status: p.status || '',
              source: 'realtor.com',
              url: resp.url
            };
          }
        }

        if (propertyData && (propertyData.address || propertyData.photos.length)) {
          return res.status(200).json({ success: true, property: propertyData });
        }

        // __NEXT_DATA__ found but couldn't extract property — return what we found for debugging
        return res.status(200).json({
          success: false,
          error: 'Found page data but could not extract property details. The listing may not be active.',
          searchedFor: searchQuery,
          pageKeys: Object.keys(props || {}),
          finalUrl: resp.url
        });

      } catch (parseErr) {
        return res.status(200).json({
          success: false,
          error: 'Failed to parse page data: ' + parseErr.message,
          searchedFor: searchQuery
        });
      }
    }

    // No __NEXT_DATA__ found — check if we got a CAPTCHA or block page
    const hasBlockIndicator = html.includes('captcha') || html.includes('blocked') || html.includes('Access Denied');
    if (hasBlockIndicator) {
      return res.status(200).json({
        success: false,
        error: 'Realtor.com served a CAPTCHA or block page. Try again in a few minutes.',
        searchedFor: searchQuery
      });
    }

    return res.status(200).json({
      success: false,
      error: 'Page loaded but no property data found. The address may not match an active listing.',
      searchedFor: searchQuery,
      finalUrl: resp.url,
      htmlLength: html.length
    });

  } catch (e) {
    return res.status(200).json({
      success: false,
      error: 'Request failed: ' + e.message,
      searchedFor: searchQuery
    });
  }
}
