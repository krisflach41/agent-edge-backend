// /api/test-finra.js — V6: Try discovered FINRA endpoints
// ?step=1  FINRA search and lookup APIs
// ?step=2  Try FIST service + DPLR search API for TBA data

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = req.query.step || '1';
  var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  var results = [];

  if (step === '1') {
    // Try the search/lookup APIs from ctl-common.js
    var urls = [
      // DPLR search API - found in the JS
      'https://search-api-ext.dplr.finra.org/search?query=FNCL+5.5+30YR&limit=5',
      // Lookup API patterns
      'https://search-api-ext.dplr.finra.org/di-lookup/api/v1/lookup?lookupSources=FIRMS+BOIAResults=10&hl=true&query=FNCL',
      // FIST endpoints
      'https://fist.finra.org',
      // Direct securitized products market aggregate from FINRA
      'https://www.finra.org/finra-data/api/securitizedProducts/marketAggregates',
      // Bond market activity endpoint
      'https://www.finra.org/finra-data/api/bondMarketActivity'
    ];

    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], {
          headers: { 'User-Agent': ua, 'Accept': 'application/json,text/html,*/*', 'Referer': 'https://www.finra.org/' },
          redirect: 'follow'
        });
        var text = await r.text();
        results.push({ url: urls[i], status: r.status, type: r.headers.get('content-type'), body: text.substring(0, 800) });
      } catch (e) {
        results.push({ url: urls[i], error: e.message });
      }
    }
    return res.status(200).json({ step: 1, results: results });
  }

  if (step === '2') {
    // Try the securitized products aggregate data page which is public
    // and the bond market activity page - these have structured data
    var urls2 = [
      // SP Market aggregates - public page with end-of-day data
      'https://www.finra.org/finra-data/fixed-income/sp-market-aggregates',
      // Try fetching the page and look for embedded JSON data
      'https://www.finra.org/finra-data/fixed-income/tba',
      // TBA overview/data page
      'https://www.finra.org/finra-data/fixed-income/tba/overview'
    ];

    for (var j = 0; j < urls2.length; j++) {
      try {
        var r2 = await fetch(urls2[j], {
          headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' },
          redirect: 'follow'
        });
        var html = await r2.text();

        // Look for embedded JSON data or drupalSettings
        var jsonData = [];
        var drupalPat = /drupalSettings\s*=\s*(\{[^;]{0,2000})/g;
        var dm;
        while ((dm = drupalPat.exec(html)) !== null) {
          jsonData.push(dm[1].substring(0, 500));
        }

        // Look for any data-config or data-api attributes
        var configPat = /data-(?:config|api|endpoint|url|src)=["']([^"']+)["']/gi;
        var configs = [];
        var cm;
        while ((cm = configPat.exec(html)) !== null) {
          configs.push(cm[1]);
        }

        // Look for inline JSON arrays that might be trade data
        var jsonArrayPat = /\[{"(?:date|tradeDate|coupon|price|high|low|last)[^}]{0,200}}/g;
        var inlineData = [];
        var jm;
        while ((jm = jsonArrayPat.exec(html)) !== null) {
          inlineData.push(jm[0].substring(0, 300));
        }

        results.push({
          url: urls2[j],
          status: r2.status,
          htmlLength: html.length,
          drupalSettings: jsonData,
          dataConfigs: configs.slice(0, 10),
          inlineJsonData: inlineData.slice(0, 5)
        });
      } catch (e) {
        results.push({ url: urls2[j], error: e.message });
      }
    }
    return res.status(200).json({ step: 2, results: results });
  }

  return res.status(200).json({ error: 'Use ?step=1 or ?step=2' });
};
