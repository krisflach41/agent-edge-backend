// /api/markets.js - Markets Overview data endpoint (REBUILT)
// UMBS coupon daily OHLC from Yahoo Finance TBA futures
// Treasury yields from FRED
// S&P 500 from Yahoo Finance
// Intraday snapshots from Supabase (9am, 12pm, 2pm, 5pm ET)

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const TREASURY_SERIES = {
  '10Y': 'DGS10'
};

// Yahoo Finance tickers for UMBS TBA futures
// These are CBOT TBA futures — delayed but give us daily OHLC
const UMBS_TICKERS = {
  'UMBS_5':   '50U=F',
  'UMBS_5.5': '55U=F',
  'UMBS_6':   '60U=F'
};

// ─── Yahoo Finance: Quote (current price + OHLC) ───────────────
async function fetchYahooQuote(symbol) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?interval=1d&range=5d&includePrePost=false';
  var res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error('Yahoo API error: ' + res.status);
  var data = await res.json();
  var result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) throw new Error('No data for ' + symbol);

  var meta = result.meta || {};
  var quotes = result.indicators && result.indicators.quote && result.indicators.quote[0];
  var timestamps = result.timestamp || [];

  var currentPrice = meta.regularMarketPrice || null;
  var previousClose = meta.chartPreviousClose || meta.previousClose || null;

  var days = [];
  if (quotes && timestamps.length > 0) {
    for (var i = 0; i < timestamps.length; i++) {
      if (quotes.open[i] !== null) {
        days.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume ? quotes.volume[i] : null
        });
      }
    }
  }

  var todayOpen = days.length > 0 ? days[days.length - 1].open : null;
  var change = (currentPrice && previousClose) ? currentPrice - previousClose : null;

  return {
    price: currentPrice,
    open: todayOpen,
    previousClose: previousClose,
    high: days.length > 0 ? days[days.length - 1].high : null,
    low: days.length > 0 ? days[days.length - 1].low : null,
    change: change,
    changePercent: (change && previousClose) ? (change / previousClose * 100) : null,
    days: days
  };
}

// ─── Yahoo Finance: Historical candles ──────────────────────────
async function fetchYahooHistory(symbol, range, interval) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?interval=' + interval + '&range=' + range + '&includePrePost=false';
  var res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error('Yahoo history error: ' + res.status);
  var data = await res.json();
  var result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) return [];

  var quotes = result.indicators && result.indicators.quote && result.indicators.quote[0];
  var timestamps = result.timestamp || [];
  var candles = [];

  if (quotes && timestamps.length > 0) {
    for (var i = 0; i < timestamps.length; i++) {
      if (quotes.open[i] !== null && quotes.close[i] !== null) {
        candles.push({
          date: new Date(timestamps[i] * 1000).toISOString(),
          open: Math.round(quotes.open[i] * 1000) / 1000,
          high: Math.round(quotes.high[i] * 1000) / 1000,
          low: Math.round(quotes.low[i] * 1000) / 1000,
          close: Math.round(quotes.close[i] * 1000) / 1000,
          volume: quotes.volume ? quotes.volume[i] : null
        });
      }
    }
  }
  return candles;
}

// ─── FRED: Treasury Yields ──────────────────────────────────────
async function fetchTreasuryYields(apiKey) {
  var results = {};
  var keys = Object.keys(TREASURY_SERIES);

  var promises = keys.map(function(tenor) {
    var url = FRED_BASE +
      '?series_id=' + TREASURY_SERIES[tenor] +
      '&api_key=' + apiKey +
      '&file_type=json&sort_order=desc&limit=10';

    return fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var obs = data.observations || [];
        var current = null, previous = null;
        for (var i = 0; i < obs.length; i++) {
          if (obs[i].value && obs[i].value !== '.') {
            if (!current) current = { value: parseFloat(obs[i].value), date: obs[i].date };
            else if (!previous) { previous = { value: parseFloat(obs[i].value), date: obs[i].date }; break; }
          }
        }
        var change = (current && previous) ? current.value - previous.value : null;
        results[tenor] = {
          yield: current ? current.value : null,
          previousYield: previous ? previous.value : null,
          change: change,
          changeBps: change !== null ? Math.round(change * 100) : null,
          date: current ? current.date : null
        };
      })
      .catch(function(err) { results[tenor] = { yield: null, error: err.message }; });
  });

  await Promise.all(promises);
  return results;
}

// ─── FRED: Treasury yield history ───────────────────────────────
async function fetchTreasuryHistory(apiKey, seriesId, days) {
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  var dateStr = startDate.toISOString().split('T')[0];

  var url = FRED_BASE +
    '?series_id=' + seriesId +
    '&api_key=' + apiKey +
    '&file_type=json&sort_order=asc' +
    '&observation_start=' + dateStr;

  var res = await fetch(url);
  if (!res.ok) throw new Error('FRED history error: ' + res.status);
  var data = await res.json();
  var obs = data.observations || [];
  var candles = [];

  for (var i = 0; i < obs.length; i++) {
    if (obs[i].value && obs[i].value !== '.') {
      candles.push({ date: obs[i].date, value: parseFloat(obs[i].value) });
    }
  }
  return candles;
}

// ─── Supabase: Fetch today's intraday snapshots ─────────────────
async function fetchSnapshots() {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};

  var now = new Date();
  var etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  var etDate = new Date(etStr);
  var today = etDate.getFullYear() + '-' +
    String(etDate.getMonth() + 1).padStart(2, '0') + '-' +
    String(etDate.getDate()).padStart(2, '0');

  var yesterday = new Date(etDate);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2);
  if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.getFullYear() + '-' +
    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
    String(yesterday.getDate()).padStart(2, '0');

  try {
    var url = SUPABASE_URL + '/rest/v1/market_snapshots?date=in.(' + today + ',' + yesterdayStr + ')&order=captured_at.asc';
    var resp = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    if (!resp.ok) return {};
    var rows = await resp.json();

    var result = {};
    rows.forEach(function(r) {
      if (!result[r.symbol]) result[r.symbol] = {};
      result[r.symbol][r.time_label] = { price: r.price, date: r.date };
    });
    return result;
  } catch (e) {
    console.error('Snapshot fetch error:', e.message);
    return {};
  }
}

// ─── Main Handler ───────────────────────────────────────────────
module.exports = async (req, res) => {
  var origin = req.headers.origin || '';
  var allowed = [
    'https://kristyflach.com',
    'https://kristyflach41.github.io',
    'https://agent-edge-backend.vercel.app'
  ];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  var query = req.query || {};
  var mode = query.mode || 'snapshot';
  var symbol = query.symbol || null;
  var range = query.range || '3mo';
  var interval = query.interval || '1d';
  var coupon = query.coupon || '5.5'; // Active UMBS coupon: 5, 5.5, or 6

  try {
    // ─── SNAPSHOT MODE ───
    if (mode === 'snapshot') {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

      var umbsKey = 'UMBS_' + coupon;
      var umbsTicker = UMBS_TICKERS[umbsKey];

      // Fetch in parallel
      var treasuryPromise = fetchTreasuryYields(apiKey);
      var snapshotPromise = fetchSnapshots();
      var umbsPromise = umbsTicker
        ? fetchYahooQuote(umbsTicker).catch(function(err) { return { price: null, error: err.message }; })
        : Promise.resolve({ price: null, error: 'Unknown coupon' });
      var spyPromise = fetchYahooQuote('SPY').catch(function(err) { return { price: null, error: err.message }; });

      var treasuries = await treasuryPromise;
      var snapshots = await snapshotPromise;
      var umbs = await umbsPromise;
      var spy = await spyPromise;

      return res.status(200).json({
        mode: 'snapshot',
        activeCoupon: coupon,
        umbs: umbs,
        treasuries: treasuries,
        spy: spy,
        snapshots: snapshots,
        fetchedAt: new Date().toISOString(),
        source: {
          treasuries: 'FRED (Federal Reserve Bank of St. Louis)',
          umbs: 'Yahoo Finance (CBOT TBA Futures, delayed)',
          spy: 'Yahoo Finance (delayed)'
        }
      });
    }

    // ─── HISTORY MODE ───
    if (mode === 'history') {
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

      if (!symbol) {
        return res.status(400).json({ error: 'symbol required. Use: UMBS_5, UMBS_5.5, UMBS_6, SPY, 10Y' });
      }

      // Treasury history
      if (TREASURY_SERIES[symbol]) {
        var daysMap = {
          '1mo': 35, '3mo': 100, '6mo': 200, '1y': 370,
          '2y': 740, 'ytd': 366, 'max': 3650
        };
        var numDays = daysMap[range] || 100;
        var history = await fetchTreasuryHistory(apiKey, TREASURY_SERIES[symbol], numDays);
        return res.status(200).json({
          mode: 'history', symbol: symbol, range: range,
          type: 'treasury', data: history, fetchedAt: new Date().toISOString()
        });
      }

      // UMBS history
      var umbsTkr = UMBS_TICKERS[symbol];
      if (umbsTkr) {
        var candles = await fetchYahooHistory(umbsTkr, range, interval);
        return res.status(200).json({
          mode: 'history', symbol: symbol, range: range, interval: interval,
          type: 'mbs', data: candles, fetchedAt: new Date().toISOString()
        });
      }

      // SPY / S&P 500 history
      if (symbol === 'SPY') {
        var spyCandles = await fetchYahooHistory('SPY', range, interval);
        return res.status(200).json({
          mode: 'history', symbol: 'SPY', range: range, interval: interval,
          type: 'equity', data: spyCandles, fetchedAt: new Date().toISOString()
        });
      }

      return res.status(400).json({ error: 'Unknown symbol: ' + symbol });
    }

    return res.status(400).json({ error: 'Unknown mode. Use: snapshot or history' });

  } catch (err) {
    console.error('Markets API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
