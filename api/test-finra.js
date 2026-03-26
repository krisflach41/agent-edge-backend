// /api/test-finra.js — V2: Discovers correct dataset names then queries them
// Hit: https://agent-edge-backend.vercel.app/api/test-finra
// Delete after testing

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var clientId = process.env.FINRA_CLIENT_ID;
  var clientSecret = process.env.FINRA_CLIENT_SECRET;
  var results = { steps: [], timestamp: new Date().toISOString() };

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      error: 'FINRA_CLIENT_ID or FINRA_CLIENT_SECRET not set',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret
    });
  }

  // ─── STEP 1: Get OAuth token ───
  var token;
  try {
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
    if (!authRes.ok || !authData.access_token) {
      results.steps.push({ step: 'auth', status: authRes.status, response: authData });
      results.error = 'Auth failed';
      return res.status(200).json(results);
    }
    token = authData.access_token;
    results.steps.push({ step: 'auth', status: 200, ok: true, expiresIn: authData.expires_in });
  } catch (e) {
    results.steps.push({ step: 'auth', error: e.message });
    return res.status(200).json(results);
  }

  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  // ─── STEP 2: List ALL datasets in fixedIncomeMarket group via GET datasets endpoint ───
  try {
    var dsRes = await fetch('https://api.finra.org/data/group/fixedIncomeMarket/datasets', { headers: headers });
    var dsText = await dsRes.text();
    var dsData;
    try { dsData = JSON.parse(dsText); } catch(e) { dsData = dsText.substring(0, 2000); }
    results.steps.push({ step: 'list_datasets_v1', status: dsRes.status, response: dsData });
  } catch (e) {
    results.steps.push({ step: 'list_datasets_v1', error: e.message });
  }

  // ─── STEP 3: Try metadata for various possible TRACE dataset names ───
  var datasetNames = [
    'trace',
    'treasuryDailyAggregates',
    'securitizedProductCappedVolume',
    'agencyDebtMarketBreadth',
    'corporateDebtMarketBreadth',
    'corporateDebtMarketSentiment',
    'corporate144ADebtMarketBreadth',
    'corporate144ADebtMarketSentiment',
    'corporateAndAgencyCappedVolume',
    'agencyDebtMarketSentiment',
    'treasuryMonthlyAggregates'
  ];

  for (var i = 0; i < datasetNames.length; i++) {
    var name = datasetNames[i];
    try {
      var metaRes = await fetch(
        'https://api.finra.org/metadata/group/fixedIncomeMarket/name/' + name,
        { headers: headers }
      );
      var metaText = await metaRes.text();
      var metaData;
      try { metaData = JSON.parse(metaText); } catch(e) { metaData = metaText.substring(0, 500); }

      var stepResult = {
        step: 'metadata_' + name,
        status: metaRes.status,
        exists: metaRes.ok
      };

      // Only include full response for datasets that exist
      if (metaRes.ok) {
        stepResult.fields = metaData.fields ? metaData.fields.map(function(f) { return f.name; }) : [];
        stepResult.partitionFields = metaData.partitionFields || [];
      }

      results.steps.push(stepResult);

      // If it exists, query a small sample
      if (metaRes.ok) {
        var dataRes = await fetch(
          'https://api.finra.org/data/group/fixedIncomeMarket/name/' + name,
          {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ limit: 3 })
          }
        );
        var dataText = await dataRes.text();
        var dataBody;
        try { dataBody = JSON.parse(dataText); } catch(e) { dataBody = dataText.substring(0, 1500); }
        results.steps.push({
          step: 'sample_' + name,
          status: dataRes.status,
          ok: dataRes.ok,
          recordCount: Array.isArray(dataBody) ? dataBody.length : 'N/A',
          sampleRecords: Array.isArray(dataBody) ? dataBody.slice(0, 3) : dataBody
        });
      }
    } catch (e) {
      results.steps.push({ step: 'metadata_' + name, error: e.message });
    }
  }

  // ─── STEP 4: If 'trace' dataset exists and has data, try filtering for FNCL/UMBS ───
  try {
    var traceRes = await fetch(
      'https://api.finra.org/data/group/fixedIncomeMarket/name/trace',
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          limit: 20,
          dateRangeFilters: [{
            fieldName: 'tradeReportDate',
            startDate: getRecentTradeDate(5),
            endDate: getRecentTradeDate(0)
          }]
        })
      }
    );
    var traceText = await traceRes.text();
    var traceData;
    try { traceData = JSON.parse(traceText); } catch(e) { traceData = traceText.substring(0, 2000); }
    results.steps.push({
      step: 'trace_date_query',
      status: traceRes.status,
      recordCount: Array.isArray(traceData) ? traceData.length : 'N/A',
      response: Array.isArray(traceData) ? traceData.slice(0, 5) : traceData
    });
  } catch(e) {
    results.steps.push({ step: 'trace_date_query', error: e.message });
  }

  // ─── STEP 5: Try alternate date field names ───
  var dateFields = ['tradeDate', 'reportDate', 'settlementDate', 'activityDate'];
  for (var d = 0; d < dateFields.length; d++) {
    try {
      var altRes = await fetch(
        'https://api.finra.org/data/group/fixedIncomeMarket/name/trace',
        {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            limit: 5,
            dateRangeFilters: [{
              fieldName: dateFields[d],
              startDate: getRecentTradeDate(5),
              endDate: getRecentTradeDate(0)
            }]
          })
        }
      );
      var altText = await altRes.text();
      var altData;
      try { altData = JSON.parse(altText); } catch(e) { altData = altText.substring(0, 1000); }
      results.steps.push({
        step: 'trace_dateField_' + dateFields[d],
        status: altRes.status,
        recordCount: Array.isArray(altData) ? altData.length : 'N/A',
        response: Array.isArray(altData) ? altData.slice(0, 2) : altData
      });
    } catch(e) {
      results.steps.push({ step: 'trace_dateField_' + dateFields[d], error: e.message });
    }
  }

  return res.status(200).json(results);
};

function getRecentTradeDate(daysBack) {
  var d = new Date();
  d.setDate(d.getDate() - daysBack);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
