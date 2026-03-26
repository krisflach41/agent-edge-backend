// /api/test-finra.js — V4: Probe FINRA Bond Center internal data endpoints
// The TBA Trade Activity page loads data via XHR from these known endpoints
// Hit: https://agent-edge-backend.vercel.app/api/test-finra
// ?step=1  Probe known FINRA data center endpoints for TBA
// ?step=2  Try gateway endpoint with FNCL 5.5 filter
// ?step=3  Try direct scrape of the trade activity page

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = req.query.step || '1';
  var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  var results = { step: step, timestamp: new Date().toISOString(), probes: [] };

  if (step === '1') {
    // Probe known FINRA data center API patterns
    var urls = [
      // Pattern 1: New FINRA data center API (used by the React frontend)
      'https://services-dyp.ddwa.finra.org/DDWAService/api/1/app/BondCenter/TBATradeActivity',
      // Pattern 2: Gateway API
      'https://gateway.finra.org/api/fixedincome/tba/trade',
      // Pattern 3: Direct FINRA data endpoint
      'https://www.finra.org/sites/default/files/data/tba-trade-activity.json',
      // Pattern 4: FINRA fixed income data API  
      'https://fixedincome.finra.org/api/tba/trade',
      // Pattern 5: Older bond center pattern via Morningstar  
      'https://finra-markets.morningstar.com/BondCenter/TBATradeData.jsp?productType=TBA&dateRange=10Y'
    ];

    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], {
          headers: { 'User-Agent': ua, 'Accept': 'application/json, text/html, */*' },
          redirect: 'follow'
        });
        var text = await r.text();
        results.probes.push({
          url: urls[i],
          status: r.status,
          contentType: r.headers.get('content-type') || 'unknown',
          bodyPreview: text.substring(0, 500),
          redirected: r.redirected,
          finalUrl: r.url
        });
      } catch (e) {
        results.probes.push({ url: urls[i], error: e.message });
      }
    }
    return res.status(200).json(results);
  }

  if (step === '2') {
    // Try the FINRA fixed income search/data patterns
    var urls2 = [
      // The new FINRA data center uses this pattern
      'https://www.finra.org/finra-data/api/fixedIncome/tba/trade?agencyType=FNCL&couponRate=5.5&maturityTerm=30&limit=20',
      'https://www.finra.org/api/fixedIncome/tba/trade?agencyType=FNCL&couponRate=5.5',
      // Try the Drupal JSON API pattern (FINRA site is Drupal)
      'https://www.finra.org/jsonapi/node/fixed_income_data',
      // Try GraphQL pattern
      'https://www.finra.org/graphql'
    ];

    for (var j = 0; j < urls2.length; j++) {
      try {
        var r2 = await fetch(urls2[j], {
          headers: { 'User-Agent': ua, 'Accept': 'application/json, */*' },
          redirect: 'follow'
        });
        var text2 = await r2.text();
        results.probes.push({
          url: urls2[j],
          status: r2.status,
          contentType: r2.headers.get('content-type') || 'unknown',
          bodyPreview: text2.substring(0, 500)
        });
      } catch (e) {
        results.probes.push({ url: urls2[j], error: e.message });
      }
    }
    return res.status(200).json(results);
  }

  if (step === '3') {
    // Fetch the actual TBA trade page and look for data URLs in the HTML/JS
    try {
      var pageRes = await fetch('https://www.finra.org/finra-data/fixed-income/tba/trade', {
        headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' }
      });
      var html = await pageRes.text();
      
      // Look for API endpoint patterns in the page source
      var apiPatterns = [];
      var patterns = [
        /["'](https?:\/\/[^"'\s]*(?:api|data|service|endpoint)[^"'\s]*tba[^"'\s]*)["']/gi,
        /["'](https?:\/\/[^"'\s]*finra[^"'\s]*(?:trade|bond|fixed)[^"'\s]*)["']/gi,
        /["'](\/api\/[^"'\s]+)["']/gi,
        /["'](\/finra-data\/api[^"'\s]+)["']/gi,
        /fetch\(["']([^"']+)["']/gi,
        /["'](https?:\/\/[^"'\s]*ddwa[^"'\s]*)["']/gi,
        /["'](https?:\/\/[^"'\s]*gateway[^"'\s]*fixed[^"'\s]*)["']/gi
      ];
      
      patterns.forEach(function(pat) {
        var m;
        while ((m = pat.exec(html)) !== null) {
          if (apiPatterns.indexOf(m[1]) === -1) apiPatterns.push(m[1]);
        }
      });

      // Also look for script src URLs that might contain the app bundle
      var scriptUrls = [];
      var scriptPat = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
      var sm;
      while ((sm = scriptPat.exec(html)) !== null) {
        if (sm[1].indexOf('chunk') !== -1 || sm[1].indexOf('main') !== -1 || sm[1].indexOf('app') !== -1 || sm[1].indexOf('bundle') !== -1) {
          scriptUrls.push(sm[1]);
        }
      }

      results.probes.push({
        url: 'https://www.finra.org/finra-data/fixed-income/tba/trade',
        status: pageRes.status,
        htmlLength: html.length,
        apiEndpointsFound: apiPatterns.slice(0, 20),
        appScripts: scriptUrls.slice(0, 10),
        containsReact: html.indexOf('react') !== -1 || html.indexOf('React') !== -1,
        containsAngular: html.indexOf('angular') !== -1 || html.indexOf('ng-') !== -1,
        containsDrupal: html.indexOf('drupal') !== -1 || html.indexOf('Drupal') !== -1
      });
    } catch (e) {
      results.probes.push({ error: e.message });
    }
    return res.status(200).json(results);
  }

  return res.status(200).json({ error: 'Use ?step=1, ?step=2, or ?step=3' });
};
