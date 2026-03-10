// /api/property-lookup.js — Look up property data from Realtor.com by address
// GET ?address=5329+113th+Place+NE+Marysville+WA
// Returns: { success, property: { address, price, beds, baths, sqft, lotSize, yearBuilt, description, photos[], listingAgent, mlsId } }

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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  };

  // Strategy 1: Try Realtor.com search
  try {
    const searchQuery = address || mlsId;
    const searchUrl = `https://www.realtor.com/realestateandhomes-search/${encodeURIComponent(searchQuery.replace(/\s+/g, '-').replace(/,/g, ''))}`;
    
    const searchResp = await fetch(searchUrl, { headers });
    
    if (searchResp.ok) {
      const html = await searchResp.text();
      
      // Look for __NEXT_DATA__ JSON blob
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const props = nextData?.props?.pageProps;
          
          // Try to find property data in various locations
          let propertyData = null;
          
          // Search results page
          if (props?.searchResults?.home_search?.results?.length) {
            const listing = props.searchResults.home_search.results[0];
            propertyData = {
              address: listing.location?.address?.line || '',
              city: listing.location?.address?.city || '',
              state: listing.location?.address?.state_code || '',
              zip: listing.location?.address?.postal_code || '',
              price: listing.list_price || listing.price,
              beds: listing.description?.beds,
              baths: listing.description?.baths,
              sqft: listing.description?.sqft,
              lotSize: listing.description?.lot_sqft,
              yearBuilt: listing.description?.year_built,
              description: listing.description?.text || '',
              photos: (listing.photos || []).map(p => p.href).filter(Boolean),
              listingAgent: listing.advertisers?.[0]?.name || '',
              mlsId: listing.mls_id || listing.property_id || '',
              propertyType: listing.description?.type || '',
              source: 'realtor.com',
              url: listing.permalink ? `https://www.realtor.com${listing.permalink}` : ''
            };
          }
          
          // Single property detail page
          if (!propertyData && props?.property) {
            const p = props.property;
            propertyData = {
              address: p.location?.address?.line || '',
              city: p.location?.address?.city || '',
              state: p.location?.address?.state_code || '',
              zip: p.location?.address?.postal_code || '',
              price: p.list_price || p.price,
              beds: p.description?.beds,
              baths: p.description?.baths,
              sqft: p.description?.sqft,
              lotSize: p.description?.lot_sqft,
              yearBuilt: p.description?.year_built,
              description: p.description?.text || '',
              photos: (p.photos || []).map(ph => ph.href).filter(Boolean),
              listingAgent: p.advertisers?.[0]?.name || '',
              mlsId: p.mls_id || p.property_id || '',
              propertyType: p.description?.type || '',
              source: 'realtor.com',
              url: ''
            };
          }

          if (propertyData && (propertyData.address || propertyData.photos.length)) {
            return res.status(200).json({ success: true, property: propertyData, strategy: 'realtor-nextdata' });
          }
        } catch (parseErr) {
          // JSON parse failed, continue to next strategy
        }
      }
    }
  } catch (e) {
    // Realtor.com failed, try Redfin
  }

  // Strategy 2: Try Redfin Stingray API
  try {
    const searchQuery = address || mlsId;
    
    // Step 1: Search for the property
    const autoUrl = `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(searchQuery)}&v=2&al=1`;
    const autoResp = await fetch(autoUrl, { headers });
    
    if (autoResp.ok) {
      let autoText = await autoResp.text();
      // Redfin prefixes responses with {}&&
      autoText = autoText.replace(/^\{\}\&\&/, '');
      
      try {
        const autoData = JSON.parse(autoText);
        const results = autoData?.payload?.exactMatch || autoData?.payload?.sections?.[0]?.rows?.[0];
        
        if (results) {
          const url = results.url;
          const propertyId = results.id?.replace?.('_', '') || '';
          
          if (url) {
            // Step 2: Get property details via initialInfo
            const initUrl = `https://www.redfin.com/stingray/api/home/details/initialInfo?path=${encodeURIComponent(url)}`;
            const initResp = await fetch(initUrl, { headers });
            
            if (initResp.ok) {
              let initText = await initResp.text();
              initText = initText.replace(/^\{\}\&\&/, '');
              
              try {
                const initData = JSON.parse(initText);
                const info = initData?.payload;
                const listingId = info?.listingId;
                const propId = info?.propertyId;
                
                if (propId) {
                  // Step 3: Get above the fold data (main property info + photos)
                  const aboveUrl = `https://www.redfin.com/stingray/api/home/details/aboveTheFold?propertyId=${propId}&listingId=${listingId || ''}&accessLevel=1`;
                  const aboveResp = await fetch(aboveUrl, { headers });
                  
                  if (aboveResp.ok) {
                    let aboveText = await aboveResp.text();
                    aboveText = aboveText.replace(/^\{\}\&\&/, '');
                    
                    const aboveData = JSON.parse(aboveText);
                    const payload = aboveData?.payload;
                    const basic = payload?.addressSectionInfo;
                    const media = payload?.mediaBrowserInfo;
                    const listing = payload?.listingMetadata;
                    
                    const photos = (media?.photos || []).map(p => {
                      // Get the largest photo URL available
                      return p.photoUrls?.fullScreenPhotoUrl || p.photoUrls?.nonFullScreenPhotoUrl || p.photoUrls?.lightboxListUrl || '';
                    }).filter(Boolean);
                    
                    const propertyData = {
                      address: basic?.streetAddress?.assembledAddress || '',
                      city: basic?.city || '',
                      state: basic?.state || '',
                      zip: basic?.zip || '',
                      price: basic?.priceInfo?.amount || null,
                      beds: basic?.beds,
                      baths: basic?.baths,
                      sqft: basic?.sqFt?.value,
                      lotSize: null,
                      yearBuilt: null,
                      description: '',
                      photos: photos,
                      listingAgent: '',
                      mlsId: listing?.mlsId?.value || '',
                      propertyType: basic?.propertyType || '',
                      source: 'redfin',
                      url: `https://www.redfin.com${url}`
                    };
                    
                    // Try to get below the fold for more details
                    try {
                      const belowUrl = `https://www.redfin.com/stingray/api/home/details/belowTheFold?propertyId=${propId}&listingId=${listingId || ''}&accessLevel=1`;
                      const belowResp = await fetch(belowUrl, { headers });
                      if (belowResp.ok) {
                        let belowText = await belowResp.text();
                        belowText = belowText.replace(/^\{\}\&\&/, '');
                        const belowData = JSON.parse(belowText);
                        const belowPayload = belowData?.payload;
                        
                        propertyData.yearBuilt = belowPayload?.publicRecordsInfo?.basicInfo?.yearBuilt || null;
                        propertyData.lotSize = belowPayload?.publicRecordsInfo?.basicInfo?.lotSqFt || null;
                        propertyData.description = belowPayload?.listingDescription || '';
                        propertyData.listingAgent = belowPayload?.agentInfo?.agentName || '';
                      }
                    } catch (belowErr) {
                      // Below the fold failed, continue with what we have
                    }
                    
                    if (propertyData.address || photos.length) {
                      return res.status(200).json({ success: true, property: propertyData, strategy: 'redfin-stingray' });
                    }
                  }
                }
              } catch (initParseErr) {
                // Continue
              }
            }
          }
        }
      } catch (autoParseErr) {
        // Continue
      }
    }
  } catch (e) {
    // Redfin also failed
  }

  // Both strategies failed
  return res.status(200).json({
    success: false,
    error: 'Property not found on Realtor.com or Redfin. Try a different address format or verify the MLS number.',
    searchedFor: address || mlsId
  });
}
