// /api/test-finra.js — Drop this into your backend api/ folder and deploy
// Then hit: https://agent-edge-backend.vercel.app/api/test-finra
// Tests: auth token, TBA bond data query, shows raw response format
// Delete this file after testing

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var clientId = process.env.FINRA_CLIENT_ID;
  var clientSecret = process.env.FINRA_CLIENT_SECRET;
  var results = { steps: [], timestamp: new Date().toISOString() };

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      error: 'FINRA_CLIENT_ID or FINRA_CLIENT_SECRET not set in env vars',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
  }

  // ─── STEP 1: Get OAuth token ───
  try {
    var authStart = Date.now();
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
    var authText = await authRes.text();
    var authData = null;
    try { authData = JSON.parse(authText); } catch (e) { /* not json */ }

    results.steps.push({
      step: '1_auth',
      status: authRes.status,
      ok: authRes.ok,
      elapsedMs: Date.now() - authStart,
      response: authData || authText.substring(0, 500)
    });

    if (!authRes.ok || !authData || !authData.access_token) {
      results.error = 'Auth failed — check FINRA_CLIENT_ID and FINRA_CLIENT_SECRET';
      return res.status(200).json(results);
    }

    var token = authData.access_token;
    results.tokenReceived = true;
    results.tokenExpiresIn = authData.expires_in;

  } catch (e) {
    results.steps.push({ step: '1_auth', error: e.message });
    return res.status(200).json(results);
  }

  // ─── STEP 2: Query TRACE TBA data (try multiple approaches) ───

  // Approach A: Try the documented TRACE endpoint for TBA MBS
  var queries = [
    {
      label: '2a_trace_tba_fncl',
      url: 'https://api.finra.org/data/group/fixedIncomeMarket/name/tbaMbsBond',
      body: {
        "fields": ["tradeDate", "securityDescription", "couponRate", "lastPrice", "highPrice", "lowPrice", "totalParTraded"],
        "dateRangeFilters": [{
          "fieldName": "tradeDate",
          "startDate": getRecentTradeDate(1),
          "endDate": getRecentTradeDate(0)
        }],
        "domainFilters": [{
          "fieldName": "couponRate",
          "values": ["5.0", "5.5", "6.0"]
        }],
        "limit": 50
      }
    },
    {
      label: '2b_trace_tba_broad',
      url: 'https://api.finra.org/data/group/fixedIncomeMarket/name/tbaMbsBond',
      body: {
        "fields": ["tradeDate", "securityDescription", "couponRate", "lastPrice", "highPrice", "lowPrice", "totalParTraded", "productType", "agencyType"],
        "dateRangeFilters": [{
          "fieldName": "tradeDate",
          "startDate": getRecentTradeDate(5),
          "endDate": getRecentTradeDate(0)
        }],
        "limit": 20
      }
    },
    {
      label: '2c_trace_corporate',
      url: 'https://api.finra.org/data/group/fixedIncomeMarket/name/traceConcentrated',
      body: {
        "limit": 5
      }
    }
  ];

  for (var q = 0; q < queries.length; q++) {
    try {
      var qStart = Date.now();
      var qRes = await fetch(queries[q].url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(queries[q].body)
      });
      var qText = await qRes.text();
      var qData = null;
      try { qData = JSON.parse(qText); } catch (e) { /* not json */ }

      results.steps.push({
        step: queries[q].label,
        url: queries[q].url,
        requestBody: queries[q].body,
        status: qRes.status,
        ok: qRes.ok,
        elapsedMs: Date.now() - qStart,
        recordCount: Array.isArray(qData) ? qData.length : (qData && qData.length) || 'N/A',
        response: Array.isArray(qData) ? qData.slice(0, 5) : (qData || qText.substring(0, 1000))
      });

    } catch (e) {
      results.steps.push({
        step: queries[q].label,
        error: e.message
      });
    }
  }

  // ─── STEP 3: Try to list available datasets ───
  try {
    var listStart = Date.now();
    var listRes = await fetch('https://api.finra.org/data/group/fixedIncomeMarket/name', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json'
      }
    });
    var listText = await listRes.text();
    var listData = null;
    try { listData = JSON.parse(listText); } catch (e) { /* not json */ }

    results.steps.push({
      step: '3_available_datasets',
      url: 'https://api.finra.org/data/group/fixedIncomeMarket/name',
      status: listRes.status,
      elapsedMs: Date.now() - listStart,
      response: listData || listText.substring(0, 1000)
    });
  } catch (e) {
    results.steps.push({ step: '3_available_datasets', error: e.message });
  }

  return res.status(200).json(results);
};

function getRecentTradeDate(daysBack) {
  var d = new Date();
  d.setDate(d.getDate() - daysBack);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}
