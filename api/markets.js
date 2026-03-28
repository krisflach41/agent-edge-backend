// /api/markets.js - Markets Overview data endpoint
// UMBS history from Supabase (seeded + daily cron additions)
// UMBS current price from Yahoo Finance (delayed)
// Treasury yields from FRED
// S&P 500 from Yahoo Finance
// Intraday snapshots from Supabase

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const TREASURY_SERIES = { '10Y': 'DGS10' };
const UMBS_TICKERS = { 'UMBS_5': '50U=F', 'UMBS_5.5': '55U=F', 'UMBS_6': '60U=F' };

// ─── Yahoo Finance: Quote ───────────────────────────────────────
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
        days.push({ date: new Date(timestamps[i] * 1000).toISOString().split('T')[0], open: quotes.open[i], high: quotes.high[i], low: quotes.low[i], close: quotes.close[i] });
      }
    }
  }
  var todayOpen = days.length > 0 ? days[days.length - 1].open : null;
  var change = (currentPrice && previousClose) ? currentPrice - previousClose : null;
  return { price: currentPrice, open: todayOpen, previousClose: previousClose, high: days.length > 0 ? days[days.length - 1].high : null, low: days.length > 0 ? days[days.length - 1].low : null, change: change, days: days };
}

// ─── Yahoo Finance: Historical candles (SPY only) ───────────────
async function fetchYahooHistory(symbol, range, interval) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=' + interval + '&range=' + range + '&includePrePost=false';
  var res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
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
        candles.push({ date: new Date(timestamps[i] * 1000).toISOString(), open: Math.round(quotes.open[i] * 1000) / 1000, high: Math.round(quotes.high[i] * 1000) / 1000, low: Math.round(quotes.low[i] * 1000) / 1000, close: Math.round(quotes.close[i] * 1000) / 1000 });
      }
    }
  }
  return candles;
}

// ─── FRED: Treasury Yields ──────────────────────────────────────
async function fetchTreasuryYields(apiKey) {
  var results = {};
  var url = FRED_BASE + '?series_id=DGS10&api_key=' + apiKey + '&file_type=json&sort_order=desc&limit=10';
  try {
    var r = await fetch(url);
    var data = await r.json();
    var obs = data.observations || [];
    var current = null, previous = null;
    for (var i = 0; i < obs.length; i++) {
      if (obs[i].value && obs[i].value !== '.') {
        if (!current) current = { value: parseFloat(obs[i].value), date: obs[i].date };
        else if (!previous) { previous = { value: parseFloat(obs[i].value), date: obs[i].date }; break; }
      }
    }
    var change = (current && previous) ? current.value - previous.value : null;
    results['10Y'] = { yield: current ? current.value : null, previousYield: previous ? previous.value : null, change: change, changeBps: change !== null ? Math.round(change * 100) : null, date: current ? current.date : null };
  } catch (err) { results['10Y'] = { yield: null, error: err.message }; }
  return results;
}

// ─── FRED: Treasury history ─────────────────────────────────────
async function fetchTreasuryHistory(apiKey, days) {
  var startDate = new Date(); startDate.setDate(startDate.getDate() - days);
  var url = FRED_BASE + '?series_id=DGS10&api_key=' + apiKey + '&file_type=json&sort_order=asc&observation_start=' + startDate.toISOString().split('T')[0];
  var res = await fetch(url);
  if (!res.ok) throw new Error('FRED history error: ' + res.status);
  var data = await res.json();
  var candles = [];
  (data.observations || []).forEach(function(o) { if (o.value && o.value !== '.') candles.push({ date: o.date, value: parseFloat(o.value) }); });
  return candles;
}

// ─── Supabase: UMBS historical OHLC ────────────────────────────
async function fetchUmbsHistory(symbol, days) {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  var startDate = new Date(); startDate.setDate(startDate.getDate() - days);
  var dateStr = startDate.toISOString().split('T')[0];
  try {
    var url = SUPABASE_URL + '/rest/v1/umbs_daily_history?symbol=eq.' + encodeURIComponent(symbol) + '&date=gte.' + dateStr + '&order=date.asc&limit=500';
    var resp = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    if (!resp.ok) return [];
    var rows = await resp.json();
    return rows.map(function(r) {
      return { date: r.date, open: parseFloat(r.open), high: parseFloat(r.high), low: parseFloat(r.low), close: parseFloat(r.close) };
    });
  } catch (e) { console.error('UMBS history error:', e.message); return []; }
}

// ─── Supabase: Intraday snapshots ───────────────────────────────
async function fetchSnapshots() {
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return {};
  var now = new Date();
  var etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  var etDate = new Date(etStr);
  var today = etDate.getFullYear() + '-' + String(etDate.getMonth() + 1).padStart(2, '0') + '-' + String(etDate.getDate()).padStart(2, '0');
  var yesterday = new Date(etDate); yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.getDay() === 0) yesterday.setDate(yesterday.getDate() - 2);
  if (yesterday.getDay() === 6) yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
  try {
    var url = SUPABASE_URL + '/rest/v1/market_snapshots?date=in.(' + today + ',' + yesterdayStr + ')&order=captured_at.asc';
    var resp = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    if (!resp.ok) return {};
    var rows = await resp.json();
    var result = {};
    rows.forEach(function(r) { if (!result[r.symbol]) result[r.symbol] = {}; result[r.symbol][r.time_label] = { price: r.price, date: r.date }; });
    return result;
  } catch (e) { return {}; }
}

// ─── Main Handler ───────────────────────────────────────────────
module.exports = async (req, res) => {
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  res.setHeader('Access-Control-Allow-Origin', allowed.indexOf(origin) !== -1 ? origin : 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  var query = req.query || {};
  var mode = query.mode || 'snapshot';
  var symbol = query.symbol || null;
  var range = query.range || '1mo';
  var interval = query.interval || '1d';
  var coupon = query.coupon || '5.5';

  try {
    if (mode === 'snapshot') {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
      var umbsKey = 'UMBS_' + coupon;
      var umbsTicker = UMBS_TICKERS[umbsKey];
      var treasuryPromise = fetchTreasuryYields(apiKey);
      var snapshotPromise = fetchSnapshots();
      var umbsPromise = umbsTicker ? fetchYahooQuote(umbsTicker).catch(function(e) { return { price: null, error: e.message }; }) : Promise.resolve({ price: null });
      var spyPromise = fetchYahooQuote('SPY').catch(function(e) { return { price: null, error: e.message }; });
      var treasuries = await treasuryPromise;
      var snapshots = await snapshotPromise;
      var umbs = await umbsPromise;
      var spy = await spyPromise;
      return res.status(200).json({ mode: 'snapshot', activeCoupon: coupon, umbs: umbs, treasuries: treasuries, spy: spy, snapshots: snapshots, fetchedAt: new Date().toISOString() });
    }

    if (mode === 'history') {
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
      if (!symbol) return res.status(400).json({ error: 'symbol required' });

      // Treasury history from FRED
      if (symbol === '10Y') {
        var daysMap = { '5d': 10, '10d': 16, '1mo': 35, '3mo': 100, '6mo': 200, '1y': 370, '2y': 740 };
        var numDays = Math.max(daysMap[range] || 35, 250); // Always get enough for DMAs
        var history = await fetchTreasuryHistory(apiKey, numDays);
        return res.status(200).json({ mode: 'history', symbol: '10Y', range: range, type: 'treasury', data: history, fetchedAt: new Date().toISOString() });
      }

      // UMBS history from Supabase
      if (UMBS_TICKERS[symbol]) {
        var umbsDaysMap = { '5d': 10, '10d': 16, '1mo': 35, '3mo': 100, '6mo': 200, '1y': 370, '2y': 740 };
        var umbsDays = Math.max(umbsDaysMap[range] || 35, 300); // Get enough for 200 DMA
        var umbsHistory = await fetchUmbsHistory(symbol, umbsDays);
        return res.status(200).json({ mode: 'history', symbol: symbol, range: range, type: 'mbs', data: umbsHistory, fetchedAt: new Date().toISOString() });
      }

      // SPY from Yahoo
      if (symbol === 'SPY') {
        var spyRange = range;
        // Map our custom ranges to Yahoo ranges
        if (range === '5d') spyRange = '5d';
        else if (range === '10d') spyRange = '1mo';
        else if (range === '1mo') spyRange = '1mo';
        else if (range === '3mo') spyRange = '3mo';
        else if (range === '6mo') spyRange = '6mo';
        else if (range === '1y') spyRange = '1y';
        else if (range === '2y') spyRange = '2y';
        // Always get at least 1y for DMAs
        var bigRange = spyRange;
        if (['5d', '1mo'].indexOf(spyRange) !== -1) bigRange = '1y';
        else if (spyRange === '3mo') bigRange = '1y';
        var spyCandles = await fetchYahooHistory('SPY', bigRange, interval);
        return res.status(200).json({ mode: 'history', symbol: 'SPY', range: range, type: 'equity', data: spyCandles, fetchedAt: new Date().toISOString() });
      }

      return res.status(400).json({ error: 'Unknown symbol: ' + symbol });
    }

    return res.status(400).json({ error: 'Unknown mode' });
  } catch (err) {
    console.error('Markets API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
