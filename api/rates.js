// /api/rates.js - Daily mortgage rates from FRED (Optimal Blue OBMMI indices)
// Uses existing FRED_API_KEY environment variable

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const RATE_SERIES = {
  '30year':      'OBMMIC30YF',
  '30yearFHA':   'OBMMIFHA30YF',
  '30yearVA':    'OBMMIVA30YF',
  '30yearJumbo': 'OBMMIJUMBO30YF',
  '15year':      'OBMMIC15YF'
};

async function fetchLatest(seriesId, apiKey) {
  var url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + apiKey + '&file_type=json&sort_order=desc&limit=5';
  var res = await fetch(url);
  if (!res.ok) throw new Error('FRED API error: ' + res.status);
  var data = await res.json();
  var obs = data.observations || [];
  // Find most recent non-missing value
  for (var i = 0; i < obs.length; i++) {
    if (obs[i].value && obs[i].value !== '.') {
      return { rate: parseFloat(obs[i].value), date: obs[i].date };
    }
  }
  return { rate: null, date: null };
}

module.exports = async (req, res) => {
  // CORS
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ===== MBS OVERRIDE: SAVE =====
  if (req.method === 'POST') {
    var action = req.body && req.body.action;
    if (action === 'save_mbs_override') {
      var SUPABASE_URL = process.env.SUPABASE_URL;
      var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
      if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ success: false, message: 'Supabase not configured' });

      var d = req.body.data;
      if (!d || (!d.latest_price && (!d.snapshots || Object.keys(d.snapshots).length === 0))) return res.status(400).json({ success: false, message: 'Enter at least one price' });

      try {
        // Upsert into mbs_override table (single row per date)
        var row = {
          date: d.date,
          snapshots: d.snapshots || {},
          previous_close: d.previous_close || 0,
          latest_price: d.latest_price || 0,
          latest_bps: d.latest_bps || 0,
          updated_at: d.updated_at || new Date().toISOString()
        };

        // Check if today's row exists
        var checkResp = await fetch(SUPABASE_URL + '/rest/v1/mbs_override?date=eq.' + d.date, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        var existing = await checkResp.json();

        if (existing && existing.length > 0) {
          // Merge new snapshots with existing ones
          var merged = existing[0].snapshots || {};
          Object.keys(d.snapshots || {}).forEach(function(k) { merged[k] = d.snapshots[k]; });
          row.snapshots = merged;

          await fetch(SUPABASE_URL + '/rest/v1/mbs_override?date=eq.' + d.date, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(row)
          });
        } else {
          await fetch(SUPABASE_URL + '/rest/v1/mbs_override', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(row)
          });
        }
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
      }
    }
    return res.status(400).json({ success: false, message: 'Unknown action' });
  }

  // ===== MBS OVERRIDE: GET =====
  var queryAction = req.query && req.query.action;
  if (queryAction === 'get_mbs_override') {
    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(200).json({ success: false, message: 'Supabase not configured' });

    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/mbs_override?order=date.desc&limit=1', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var rows = await resp.json();
      if (rows && rows.length > 0) {
        return res.status(200).json({ success: true, override: rows[0] });
      }
      return res.status(200).json({ success: true, override: null });
    } catch (err) {
      return res.status(200).json({ success: false, message: err.message });
    }
  }

  // ===== MBS HISTORY: GET CANDLE DATA =====
  if (queryAction === 'get_mbs_history') {
    var SUPABASE_URL = process.env.SUPABASE_URL;
    var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(200).json({ success: false, data: [] });

    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/mbs_override?order=date.asc&limit=500', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var rows = await resp.json();
      if (!rows || rows.length === 0) return res.status(200).json({ success: true, data: [] });

      // Convert each day's snapshots into a candle
      var candles = [];
      rows.forEach(function(row) {
        var snaps = row.snapshots || {};
        var prices = [];
        var closePrice = null;
        var order = ['premarket', 'open', 'midday', 'afternoon', 'close'];
        order.forEach(function(slot) {
          if (snaps[slot] && snaps[slot].price) {
            prices.push(snaps[slot].price);
            closePrice = snaps[slot].price;
          }
        });

        // The candle open is always the previous close (after-hours final)
        // This is the true anchor point for the day's movement
        var candleOpen = row.previous_close || null;

        // If no previous_close stored, fall back to the first snapshot
        if (!candleOpen && prices.length > 0) {
          candleOpen = prices[0];
        }

        // Include previous_close in the high/low range
        if (candleOpen) prices.push(candleOpen);

        if (prices.length > 0 && candleOpen) {
          // If no snapshots yet, close = open (flat candle)
          if (!closePrice) closePrice = candleOpen;
          candles.push({
            date: row.date,
            open: candleOpen,
            close: closePrice,
            high: Math.max.apply(null, prices),
            low: Math.min.apply(null, prices)
          });
        }
      });

      return res.status(200).json({ success: true, data: candles });
    } catch (err) {
      return res.status(200).json({ success: false, data: [], message: err.message });
    }
  }

  // ===== ORIGINAL: FRED RATES =====
  // Cache for 4 hours — rates update nightly so no need to hit FRED on every page load
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600');

  var apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  try {
    var results = {};
    var latestDate = null;

    var keys = Object.keys(RATE_SERIES);
    var promises = keys.map(function(key) {
      return fetchLatest(RATE_SERIES[key], apiKey).then(function(data) {
        results[key] = data.rate;
        if (data.date && (!latestDate || data.date > latestDate)) {
          latestDate = data.date;
        }
      });
    });

    await Promise.all(promises);

    return res.status(200).json({
      rates: results,
      asOf: latestDate,
      source: 'Optimal Blue OBMMI via FRED',
      fetchedAt: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
