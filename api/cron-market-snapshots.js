// /api/cron-market-snapshots.js
// Captures market price snapshots at 9am, 12pm, 2pm, 5pm ET
// At 5pm (Close), also writes daily OHLC to umbs_daily_history for chart data
// Stores snapshots in Supabase table: market_snapshots
// Stores daily OHLC in Supabase table: umbs_daily_history

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
  var quotes = result.indicators && result.indicators.quote && result.indicators.quote[0];
  var timestamps = result.timestamp || [];

  var currentPrice = meta.regularMarketPrice || null;
  var previousClose = meta.chartPreviousClose || meta.previousClose || null;

  // Get today's OHLC
  var todayOHLC = null;
  if (quotes && timestamps.length > 0) {
    var lastIdx = timestamps.length - 1;
    if (quotes.open[lastIdx] !== null) {
      todayOHLC = {
        open: quotes.open[lastIdx],
        high: quotes.high[lastIdx],
        low: quotes.low[lastIdx],
        close: quotes.close[lastIdx]
      };
    }
  }

  return {
    price: currentPrice,
    previousClose: previousClose,
    ohlc: todayOHLC
  };
}

async function fetchTreasuryYield(apiKey, seriesId) {
  var url = FRED_BASE + '?series_id=' + seriesId + '&api_key=' + apiKey + '&file_type=json&sort_order=desc&limit=5';
  var res = await fetch(url);
  if (!res.ok) return null;
  var data = await res.json();
  var obs = data.observations || [];
  for (var i = 0; i < obs.length; i++) {
    if (obs[i].value && obs[i].value !== '.') return { value: parseFloat(obs[i].value), date: obs[i].date };
  }
  return null;
}

module.exports = async (req, res) => {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var FRED_KEY = process.env.FRED_API_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  var headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

  try {
    var now = new Date();
    var etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    var hour = etTime.getHours();
    var min = etTime.getMinutes();

    var label = '';
    if (hour === 9 && min <= 10) label = 'Open';
    else if (hour === 12 && min <= 10) label = 'Mid-Day';
    else if (hour === 14 && min <= 10) label = 'Afternoon';
    else if ((hour === 16 && min >= 55) || (hour === 17 && min <= 5)) label = 'Close';
    else label = hour + ':' + (min < 10 ? '0' : '') + min + ' ET';

    var isClose = (label === 'Close');

    var dateStr = etTime.getFullYear() + '-' +
      String(etTime.getMonth() + 1).padStart(2, '0') + '-' +
      String(etTime.getDate()).padStart(2, '0');

    var snapshots = [];
    var dailyOHLC = []; // For umbs_daily_history at close

    // Yahoo tickers
    var yahooKeys = Object.keys(YAHOO_TICKERS);
    for (var i = 0; i < yahooKeys.length; i++) {
      try {
        var yData = await fetchYahooPrice(YAHOO_TICKERS[yahooKeys[i]]);
        if (yData && yData.price) {
          snapshots.push({
            date: dateStr, time_label: label, symbol: yahooKeys[i],
            price: yData.price, previous_close: yData.previousClose,
            captured_at: now.toISOString()
          });

          // At close, save daily OHLC for UMBS coupons (not SPY)
          if (isClose && yahooKeys[i] !== 'SPY' && yData.ohlc) {
            dailyOHLC.push({
              date: dateStr,
              symbol: yahooKeys[i],
              open: yData.ohlc.open,
              high: yData.ohlc.high,
              low: yData.ohlc.low,
              close: yData.ohlc.close
            });
          }
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
              date: dateStr, time_label: label, symbol: treasuryKeys[t],
              price: tData.value, previous_close: null,
              captured_at: now.toISOString()
            });
          }
        } catch (e) { console.error('FRED error:', e.message); }
      }
    }

    // Store snapshots
    if (snapshots.length > 0) {
      await fetch(SUPABASE_URL + '/rest/v1/market_snapshots', {
        method: 'POST', headers: headers, body: JSON.stringify(snapshots)
      });
    }

    // At close, store daily OHLC in umbs_daily_history
    if (isClose && dailyOHLC.length > 0) {
      var ohlcRes = await fetch(SUPABASE_URL + '/rest/v1/umbs_daily_history', {
        method: 'POST', headers: headers, body: JSON.stringify(dailyOHLC)
      });
      if (!ohlcRes.ok) {
        var errText = await ohlcRes.text();
        console.error('OHLC insert error:', ohlcRes.status, errText);
      }
    }

    return res.status(200).json({
      success: true, label: label, date: dateStr,
      snapshotCount: snapshots.length,
      dailyOHLCCount: dailyOHLC.length,
      symbols: snapshots.map(function(s) { return s.symbol + ': ' + s.price; })
    });

  } catch (err) {
    console.error('Snapshot cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
