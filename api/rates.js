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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache for 4 hours — rates update nightly so no need to hit FRED on every page load
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
