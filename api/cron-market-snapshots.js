// /api/cron-market-snapshots.js
// Captures market price snapshots at 9am, 12pm, 2pm, 5pm ET
// Stores in Supabase table: market_snapshots

const YAHOO_TICKERS = {
  'UMBS_5':   '50U=F',
  'UMBS_5.5': '55U=F',
  'UMBS_6':   '60U=F',
  'SPY':      'SPY'
};

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const TREASURY_SERIES = { '10Y': 'DGS10' };

async function fetchYahooPrice(symbol) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?interval=1d&range=2d&includePrePost=false';
  var res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error('Yahoo error: ' + res.status);
  var data = await res.json();
  var result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) return null;
  var meta = result.meta || {};
  return {
    price: meta.regularMarketPrice || null,
    previousClose: meta.chartPreviousClose || meta.previousClose || null
  };
}

async function fetchTreasuryYield(apiKey, seriesId) {
  var url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + apiKey + '&file_type=json&sort_order=desc&limit=5';
  var res = await fetch(url);
  if (!res.ok) return null;
  var data = await res.json();
  var obs = data.observations || [];
  for (var i = 0; i < obs.length; i++) {
    if (obs[i].value && obs[i].value !== '.') {
      return { value: parseFloat(obs[i].value), date: obs[i].date };
    }
  }
  return null;
}

module.exports = async (req, res) => {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var FRED_KEY = process.env.FRED_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    var now = new Date();
    var etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    var hour = etTime.getHours();
    var min = etTime.getMinutes();

    // Determine snapshot label
    var label = '';
    if (hour === 9 && min <= 10) label = 'Open';
    else if (hour === 12 && min <= 10) label = 'Mid-Day';
    else if (hour === 14 && min <= 10) label = 'Afternoon';
    else if ((hour === 16 && min >= 55) || (hour === 17 && min <= 5)) label = 'Close';
    else label = hour + ':' + (min < 10 ? '0' : '') + min + ' ET';

    var dateStr = etTime.getFullYear() + '-' +
      String(etTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(etTime.getDate()).padStart(2, '0');

    var snapshots = [];

    // Yahoo tickers (UMBS coupons + SPY)
    var yahooKeys = Object.keys(YAHOO_TICKERS);
    for (var i = 0; i < yahooKeys.length; i++) {
      try {
        var yData = await fetchYahooPrice(YAHOO_TICKERS[yahooKeys[i]]);
        if (yData && yData.price) {
          snapshots.push({
            date: dateStr,
            time_label: label,
            symbol: yahooKeys[i],
            price: yData.price,
            previous_close: yData.previousClose,
            captured_at: now.toISOString()
          });
        }
      } catch (e) { console.error('Yahoo error for ' + yahooKeys[i] + ':', e.message); }
    }

    // Treasury yields
    if (FRED_KEY) {
      var treasuryKeys = Object.keys(TREASURY_SERIES);
      for (var t = 0; t < treasuryKeys.length; t++) {
        try {
          var tData = await fetchTreasuryYield(FRED_KEY, TREASURY_SERIES[treasuryKeys[t]]);
          if (tData) {
            snapshots.push({
              date: dateStr,
              time_label: label,
              symbol: treasuryKeys[t],
              price: tData.value,
              previous_close: null,
              captured_at: now.toISOString()
            });
          }
        } catch (e) { console.error('FRED error for ' + treasuryKeys[t] + ':', e.message); }
      }
    }

    // Store in Supabase
    if (snapshots.length > 0) {
      var storeRes = await fetch(SUPABASE_URL + '/rest/v1/market_snapshots', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(snapshots)
      });
      if (!storeRes.ok) {
        var errText = await storeRes.text();
        console.error('Supabase store error:', storeRes.status, errText);
      }
    }

    return res.status(200).json({
      success: true,
      label: label,
      date: dateStr,
      count: snapshots.length,
      symbols: snapshots.map(function(s) { return s.symbol + ': ' + s.price; })
    });

  } catch (err) {
    console.error('Snapshot cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
