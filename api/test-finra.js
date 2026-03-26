// /api/test-finra.js — V5: Fetch FINRA app bundle + find real data API
// ?step=1  Fetch the Angular app JS, extract API endpoints
// ?step=2  Hit the discovered API endpoint for TBA data

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = req.query.step || '1';
  var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  if (step === '1') {
    // Fetch the Angular app bundle and extract API URL patterns
    var jsUrl = 'https://ddwa-cdn-us-east-1.ddwa.finra.org/app/dynamic-reporting/app-dynamic-reporting.js';
    try {
      var jsRes = await fetch(jsUrl, { headers: { 'User-Agent': ua } });
      var jsText = await jsRes.text();

      // Search for API endpoint patterns
      var endpoints = [];
      var patterns = [
        /["'](https?:\/\/[^"'\s]*ddwa[^"'\s]*)["']/gi,
        /["'](https?:\/\/[^"'\s]*finra[^"'\s]*api[^"'\s]*)["']/gi,
        /["'](\/DDWAService[^"'\s]*)["']/gi,
        /["'](\/api\/[^"'\s]+)["']/gi,
        /serviceUrl['":\s]+["']([^"']+)["']/gi,
        /apiUrl['":\s]+["']([^"']+)["']/gi,
        /baseUrl['":\s]+["']([^"']+)["']/gi,
        /["'](https?:\/\/services[^"'\s]*)["']/gi
      ];

      patterns.forEach(function(pat) {
        var m;
        while ((m = pat.exec(jsText)) !== null) {
          if (endpoints.indexOf(m[1]) === -1) endpoints.push(m[1]);
        }
      });

      // Also grab any URL that contains 'tba' or 'trade' or 'bond'
      var tbaPat = /["'](https?:\/\/[^"'\s]*(?:tba|trade|bond|securitized)[^"'\s]*)["']/gi;
      var tbaUrls = [];
      var tm;
      while ((tm = tbaPat.exec(jsText)) !== null) {
        if (tbaUrls.indexOf(tm[1]) === -1) tbaUrls.push(tm[1]);
      }

      return res.status(200).json({
        step: 1,
        jsUrl: jsUrl,
        jsStatus: jsRes.status,
        jsLength: jsText.length,
        apiEndpoints: endpoints.slice(0, 30),
        tbaRelatedUrls: tbaUrls.slice(0, 20),
        jsPreview: jsText.substring(0, 500)
      });
    } catch (e) {
      return res.status(200).json({ step: 1, error: e.message });
    }
  }

  if (step === '2') {
    // Also fetch ctl-common.js for base URL config
    var commonUrl = 'https://ddwa-cdn-us-east-1.ddwa.finra.org/ctl-common/ctl-common.js';
    try {
      var cRes = await fetch(commonUrl, { headers: { 'User-Agent': ua } });
      var cText = await cRes.text();

      var urls = [];
      var pat = /["'](https?:\/\/[^"'\s]+)["']/gi;
      var m;
      while ((m = pat.exec(cText)) !== null) {
        if (urls.indexOf(m[1]) === -1 && m[1].indexOf('finra') !== -1) urls.push(m[1]);
      }

      // Look for service/api config
      var configPat = /(?:service|api|base|endpoint)(?:Url|URL|Path|Base)['":\s]+["']([^"']+)["']/gi;
      var configs = [];
      while ((m = configPat.exec(cText)) !== null) {
        if (configs.indexOf(m[1]) === -1) configs.push(m[1]);
      }

      return res.status(200).json({
        step: 2,
        jsUrl: commonUrl,
        jsStatus: cRes.status,
        jsLength: cText.length,
        finraUrls: urls.slice(0, 30),
        serviceConfigs: configs.slice(0, 20),
        jsPreview: cText.substring(0, 500)
      });
    } catch (e) {
      return res.status(200).json({ step: 2, error: e.message });
    }
  }

  if (step === '3') {
    // Try hitting the DDWAService API directly
    var apiUrls = [
      'https://services-dyp.ddwa.finra.org/DDWAService/api/1/app/BondCenter/filterResults',
      'https://services-dyp.ddwa.finra.org/DDWAService/api/1/app/BondCenter/TBATradeActivity',
      'https://services-dyp.ddwa.finra.org/DDWAService/api/1/app/dynamic-reporting/data'
    ];

    var results = [];
    for (var i = 0; i < apiUrls.length; i++) {
      try {
        // Try GET first
        var r = await fetch(apiUrls[i], {
          headers: { 'User-Agent': ua, 'Accept': 'application/json', 'Origin': 'https://www.finra.org', 'Referer': 'https://www.finra.org/finra-data/fixed-income/tba/trade' }
        });
        var text = await r.text();
        results.push({ url: apiUrls[i], method: 'GET', status: r.status, body: text.substring(0, 500) });
      } catch (e) {
        results.push({ url: apiUrls[i], method: 'GET', error: e.message });
      }
    }
    return res.status(200).json({ step: 3, results: results });
  }

  return res.status(200).json({ error: 'Use ?step=1, ?step=2, or ?step=3' });
};
