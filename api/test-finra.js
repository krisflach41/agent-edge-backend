// /api/test-finra.js — V3 SLIM: auth + discover trace dataset
// Hit: https://agent-edge-backend.vercel.app/api/test-finra
// Add ?step=2 after step 1 works

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = req.query.step || '1';
  var clientId = process.env.FINRA_CLIENT_ID;
  var clientSecret = process.env.FINRA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(200).json({ error: 'Missing FINRA env vars' });
  }

  // Auth
  var authRes = await fetch(
    'https://ews.fip.finra.org/fip/rest/ews/oauth2/access_token?grant_type=client_credentials',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  var authData = await authRes.json();
  if (!authData.access_token) return res.status(200).json({ error: 'Auth failed', authData: authData });

  var token = authData.access_token;
  var h = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  if (step === '1') {
    // Just get metadata for the 'trace' dataset
    var m1 = await fetch('https://api.finra.org/metadata/group/fixedIncomeMarket/name/trace', { headers: h });
    var m1d = await m1.text();
    return res.status(200).json({
      step: 1,
      trace_metadata_status: m1.status,
      trace_metadata: m1d.substring(0, 3000),
      next: 'If 404, try ?step=2 to probe other names'
    });
  }

  if (step === '2') {
    // Probe 4 likely dataset names with metadata
    var names = ['securitizedProductCappedVolume', 'treasuryDailyAggregates', 'agencyDebtMarketBreadth', 'corporateDebtMarketBreadth'];
    var out = {};
    for (var i = 0; i < names.length; i++) {
      var r = await fetch('https://api.finra.org/metadata/group/fixedIncomeMarket/name/' + names[i], { headers: h });
      var txt = await r.text();
      var parsed; try { parsed = JSON.parse(txt); } catch(e) { parsed = txt.substring(0, 300); }
      out[names[i]] = { status: r.status, fields: parsed.fields ? parsed.fields.map(function(f){return f.name;}) : parsed };
    }
    return res.status(200).json({ step: 2, datasets: out, next: '?step=3 to query a working dataset' });
  }

  if (step === '3') {
    // Query securitizedProductCappedVolume for TBA data
    var ds = req.query.ds || 'securitizedProductCappedVolume';
    var r = await fetch('https://api.finra.org/data/group/fixedIncomeMarket/name/' + ds, {
      method: 'POST', headers: h,
      body: JSON.stringify({ limit: 10 })
    });
    var d = await r.text();
    var parsed; try { parsed = JSON.parse(d); } catch(e) { parsed = d.substring(0, 3000); }
    return res.status(200).json({
      step: 3,
      dataset: ds,
      status: r.status,
      recordCount: Array.isArray(parsed) ? parsed.length : 'N/A',
      data: Array.isArray(parsed) ? parsed.slice(0, 5) : parsed
    });
  }

  return res.status(200).json({ error: 'Use ?step=1, ?step=2, or ?step=3' });
};
