// /api/markets.js - Markets Overview data endpoint
// Pulls UMBS futures from Yahoo Finance, Treasury yields from FRED, S&P from Yahoo Finance
// No additional API keys needed beyond existing FRED_API_KEY

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// FRED series IDs for Treasury yields
const TREASURY_SERIES = {
  '1Y':  'DGS1',
  '2Y':  'DGS2',
  '5Y':  'DGS5',
  '7Y':  'DGS7',
  '10Y': 'DGS10'
};

// Yahoo Finance tickers
const YAHOO_TICKERS = {
  'UMBS_5':   '50U=F',
  'UMBS_5.5': '55U=F',
  'UMBS_6':   '60U=F',
  'SPY':      'SPY'
};

// ─── FRED: Treasury Yields ───────────────────────────────────────
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
        var current = null;
        var previous = null;

        // Find most recent and previous non-missing values
        for (var i = 0; i < obs.length; i++) {
          if (obs[i].value && obs[i].value !== '.') {
            if (!current) {
              current = { value: parseFloat(obs[i].value), date: obs[i].date };
            } else if (!previous) {
              previous = { value: parseFloat(obs[i].value), date: obs[i].date };
              break;
            }
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
      .catch(function(err) {
        results[tenor] = { yield: null, error: err.message };
      });
  });

  await Promise.all(promises);
  return results;
}

// ─── Yahoo Finance: UMBS + SPY ───────────────────────────────────
async function fetchYahooQuote(symbol) {
  // Use Yahoo Finance v8 quote endpoint
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=1d&range=5d&includePrePost=false';

  var res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (!res.ok) throw new Error('Yahoo API error: ' + res.status);
  var data = await res.json();

  var result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) throw new Error('No data for ' + symbol);

  var meta = result.meta || {};
  var quotes = result.indicators && result.indicators.quote && result.indicators.quote[0];
  var timestamps = result.timestamp || [];

  // Current price from meta
  var currentPrice = meta.regularMarketPrice || null;
  var previousClose = meta.chartPreviousClose || meta.previousClose || null;

  // Get OHLC data for recent days
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

async function fetchYahooHistory(symbol, range, interval) {
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?interval=' + interval + '&range=' + range + '&includePrePost=false';

  var res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
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

// ─── FRED: Treasury yield history ────────────────────────────────
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
      candles.push({
        date: obs[i].date,
        value: parseFloat(obs[i].value)
      });
    }
  }

  return candles;
}

// ─── Main Handler ────────────────────────────────────────────────
module.exports = async (req, res) => {
  // CORS
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

  // Parse query params
  var query = req.query || {};
  var mode = query.mode || 'snapshot';  // snapshot | history
  var symbol = query.symbol || null;     // for history mode: UMBS_5.5, 10Y, SPY, etc.
  var range = query.range || '3mo';      // 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, ytd, max
  var interval = query.interval || '1d'; // 1m, 5m, 15m, 1d, 1wk, 1mo

  try {
    // ─── SNAPSHOT MODE: all current prices ───
    if (mode === 'snapshot') {
      // Cache for 5 minutes
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

      // Fetch everything in parallel
      var treasuryPromise = fetchTreasuryYields(apiKey);

      var umbsPromises = {};
      var yahooKeys = Object.keys(YAHOO_TICKERS);
      yahooKeys.forEach(function(key) {
        umbsPromises[key] = fetchYahooQuote(YAHOO_TICKERS[key]).catch(function(err) {
          return { price: null, error: err.message };
        });
      });

      var treasuries = await treasuryPromise;

      var umbs = {};
      for (var k = 0; k < yahooKeys.length; k++) {
        umbs[yahooKeys[k]] = await umbsPromises[yahooKeys[k]];
      }

      return res.status(200).json({
        mode: 'snapshot',
        treasuries: treasuries,
        umbs: {
          'UMBS_5': umbs['UMBS_5'],
          'UMBS_5.5': umbs['UMBS_5.5'],
          'UMBS_6': umbs['UMBS_6']
        },
        spy: umbs['SPY'],
        fetchedAt: new Date().toISOString(),
        source: {
          treasuries: 'FRED (Federal Reserve Bank of St. Louis)',
          umbs: 'Yahoo Finance (CBOT TBA Futures, 15-20 min delayed)',
          spy: 'Yahoo Finance (15-20 min delayed)'
        }
      });
    }

    // ─── HISTORY MODE: chart data for a specific symbol ───
    if (mode === 'history') {
      // Cache for 10 minutes
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

      if (!symbol) {
        return res.status(400).json({ error: 'symbol is required for history mode. Use: UMBS_5, UMBS_5.5, UMBS_6, SPY, 1Y, 2Y, 5Y, 7Y, 10Y' });
      }

      // Treasury history
      if (TREASURY_SERIES[symbol]) {
        var daysMap = {
          '1d': 2, '5d': 7, '1mo': 35, '3mo': 100,
          '6mo': 200, '1y': 370, '2y': 740, 'ytd': 366, 'max': 3650
        };
        var numDays = daysMap[range] || 100;
        var history = await fetchTreasuryHistory(apiKey, TREASURY_SERIES[symbol], numDays);

        return res.status(200).json({
          mode: 'history',
          symbol: symbol,
          range: range,
          type: 'treasury',
          data: history,
          fetchedAt: new Date().toISOString()
        });
      }

      // UMBS or SPY history
      var ticker = YAHOO_TICKERS[symbol];
      if (ticker) {
        var candles = await fetchYahooHistory(ticker, range, interval);

        return res.status(200).json({
          mode: 'history',
          symbol: symbol,
          range: range,
          interval: interval,
          type: symbol === 'SPY' ? 'equity' : 'mbs',
          data: candles,
          fetchedAt: new Date().toISOString()
        });
      }

      return res.status(400).json({ error: 'Unknown symbol: ' + symbol });
    }

    return res.status(400).json({ error: 'Unknown mode: ' + mode + '. Use: snapshot or history' });

  } catch (err) {
    console.error('Markets API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
