// /api/property-lookup.js — Debug version to see what Realtor.com and Redfin return

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const address = req.query.address || '';
  const mlsId = req.query.mls || '';
  const debug = {};

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // Test 1: Realtor.com
  try {
    const slug = address.replace(/\s+/g, '-').replace(/,/g, '').replace(/[^a-zA-Z0-9-]/g, '');
    const url = `https://www.realtor.com/realestateandhomes-search/${slug}`;
    const resp = await fetch(url, { headers, redirect: 'follow' });
    debug.realtor = {
      status: resp.status,
      statusText: resp.statusText,
      url: resp.url,
      redirected: resp.redirected,
      contentType: resp.headers.get('content-type'),
      bodyPreview: (await resp.text()).substring(0, 500)
    };
  } catch (e) {
    debug.realtor = { error: e.message };
  }

  // Test 2: Redfin autocomplete
  try {
    const url = `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(address)}&v=2&al=1`;
    const resp = await fetch(url, { headers });
    debug.redfin = {
      status: resp.status,
      statusText: resp.statusText,
      contentType: resp.headers.get('content-type'),
      bodyPreview: (await resp.text()).substring(0, 500)
    };
  } catch (e) {
    debug.redfin = { error: e.message };
  }

  // Test 3: Zillow search
  try {
    const slug = address.replace(/\s+/g, '-').replace(/,/g, '').replace(/[^a-zA-Z0-9-]/g, '');
    const url = `https://www.zillow.com/homes/${slug}_rb/`;
    const resp = await fetch(url, { headers });
    debug.zillow = {
      status: resp.status,
      statusText: resp.statusText,
      contentType: resp.headers.get('content-type'),
      bodyPreview: (await resp.text()).substring(0, 500)
    };
  } catch (e) {
    debug.zillow = { error: e.message };
  }

  return res.status(200).json({ debug, searchedFor: address || mlsId });
}
