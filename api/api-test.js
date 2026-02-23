// /api/api-test.js - Diagnostic endpoint to test individual external APIs
// Usage: /api/api-test?test=fema&lat=39.109356&lon=-84.502584
//        /api/api-test?test=nces&lat=39.109356&lon=-84.502584
//        /api/api-test?test=bls&fips=39061
//        /api/api-test?test=hud&zip=45202
//        /api/api-test?test=permits&fips=39061

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { test, lat, lon, zip, fips } = req.query;
  const startTime = Date.now();

  try {
    let url, options = {}, label;

    switch (test) {
      case 'fema':
        label = 'FEMA Flood Zone (layer 28)';
        url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json`;
        break;

      case 'nces':
        label = 'NCES Schools (ArcGIS Online)';
        url = `https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/School_Characteristics_Current/FeatureServer/0/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=8047&units=esriSRUnit_Meter&outFields=*&returnGeometry=true&resultRecordCount=3&f=json`;
        break;

      case 'nces2':
        label = 'NCES Schools (nces.ed.gov MapServer)';
        url = `https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PUBLICSCH_2223/MapServer/0/query?geometry=${lon},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&distance=8047&units=esriSRUnit_Meter&outFields=NAME,CITY,STATE&returnGeometry=false&resultRecordCount=5&f=json`;
        break;

      case 'bls':
        label = 'BLS Employment';
        const fips5 = (fips || '').padStart(5, '0');
        const rateId = 'LAUCN' + fips5 + '0000000003';
        url = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesid: [rateId],
            startyear: '2024',
            endyear: '2025',
            registrationkey: process.env.BLS_API_KEY || ''
          })
        };
        break;

      case 'hud':
        label = 'HUD Fair Market Rents';
        url = 'https://www.huduser.gov/hudapi/public/fmr/data/' + (zip || '45202');
        options = {
          headers: { 'Authorization': 'Bearer ' + (process.env.HUD_API_KEY || '') }
        };
        break;

      case 'permits':
        label = 'HUD Building Permits';
        url = `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Residential_Construction_Permits_by_County/FeatureServer/0/query?where=cnty%3D%27${fips}%27&outFields=*&orderByFields=year+DESC&resultRecordCount=3&f=json`;
        break;

      case 'overpass':
        label = 'OpenStreetMap Overpass';
        const query = `[out:json][timeout:10];node["leisure"="park"](around:3000,${lat},${lon});out 3;`;
        url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
        break;

      default:
        return res.status(400).json({
          error: 'Specify ?test= one of: fema, nces, nces2, bls, hud, permits, overpass',
          example: '/api/api-test?test=fema&lat=39.109356&lon=-84.502584'
        });
    }

    console.log(`Testing ${label}: ${url ? url.substring(0, 120) : 'POST request'}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const fetchRes = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);

    const elapsed = Date.now() - startTime;
    const status = fetchRes.status;
    const headers = Object.fromEntries(fetchRes.headers.entries());
    const text = await fetchRes.text();

    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not json */ }

    return res.status(200).json({
      test,
      label,
      success: fetchRes.ok,
      httpStatus: status,
      elapsedMs: elapsed,
      responseHeaders: headers,
      responseSize: text.length,
      data: json || text.substring(0, 2000),
      url: url ? url.substring(0, 200) : 'POST'
    });

  } catch (e) {
    const elapsed = Date.now() - startTime;
    return res.status(200).json({
      test,
      success: false,
      error: e.message,
      errorType: e.name,
      elapsedMs: elapsed,
      isTimeout: e.name === 'AbortError'
    });
  }
}
