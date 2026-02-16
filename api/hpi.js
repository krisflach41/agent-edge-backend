// /api/hpi.js - FHFA House Price Index data from FRED API
// Deploy to Vercel. Set environment variable: FRED_API_KEY

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// State FIPS to FRED series ID mapping
const STATE_SERIES = {
  US: 'USSTHPI',
  AL: 'ALSTHPI', AK: 'AKSTHPI', AZ: 'AZSTHPI', AR: 'ARSTHPI', CA: 'CASTHPI',
  CO: 'COSTHPI', CT: 'CTSTHPI', DE: 'DESTHPI', DC: 'DCSTHPI', FL: 'FLSTHPI',
  GA: 'GASTHPI', HI: 'HISTHPI', ID: 'IDSTHPI', IL: 'ILSTHPI', IN: 'INSTHPI',
  IA: 'IASTHPI', KS: 'KSSTHPI', KY: 'KYSTHPI', LA: 'LASTHPI', ME: 'MESTHPI',
  MD: 'MDSTHPI', MA: 'MASTHPI', MI: 'MISTHPI', MN: 'MNSTHPI', MS: 'MSSTHPI',
  MO: 'MOSTHPI', MT: 'MTSTHPI', NE: 'NESTHPI', NV: 'NVSTHPI', NH: 'NHSTHPI',
  NJ: 'NJSTHPI', NM: 'NMSTHPI', NY: 'NYSTHPI', NC: 'NCSTHPI', ND: 'NDSTHPI',
  OH: 'OHSTHPI', OK: 'OKSTHPI', OR: 'ORSTHPI', PA: 'PASTHPI', RI: 'RISTHPI',
  SC: 'SCSTHPI', SD: 'SDSTHPI', TN: 'TNSTHPI', TX: 'TXSTHPI', UT: 'UTSTHPI',
  VT: 'VTSTHPI', VA: 'VASTHPI', WA: 'WASTHPI', WV: 'WVSTHPI', WI: 'WISTHPI',
  WY: 'WYSTHPI'
};

const STATE_NAMES = {
  US: 'United States', AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

// Census regions
const REGIONS = {
  'New England': ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  'Middle Atlantic': ['NJ', 'NY', 'PA'],
  'East North Central': ['IL', 'IN', 'MI', 'OH', 'WI'],
  'West North Central': ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  'South Atlantic': ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV'],
  'East South Central': ['AL', 'KY', 'MS', 'TN'],
  'West South Central': ['AR', 'LA', 'OK', 'TX'],
  'Mountain': ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'],
  'Pacific': ['AK', 'CA', 'HI', 'OR', 'WA']
};

async function fetchFredSeries(seriesId, apiKey, startDate) {
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&observation_start=${startDate}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED API error: ${res.status}`);
  const data = await res.json();
  return data.observations || [];
}

function calcPctChange(observations, quartersBack) {
  // observations are sorted desc (newest first)
  if (observations.length < quartersBack + 1) return null;
  const current = parseFloat(observations[0].value);
  const previous = parseFloat(observations[quartersBack].value);
  if (isNaN(current) || isNaN(previous) || previous === 0) return null;
  return ((current - previous) / previous * 100);
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'FRED_API_KEY not configured' });

  try {
    const { view = 'national', period = 'quarter', state } = req.query;

    // How far back to look: we need enough data for the period calculation
    // quarter=1Q, 1year=4Q, 5year=20Q, since1991=~130Q
    const quartersMap = { quarter: 1, '1year': 4, '5year': 20, 'since1991': 0 };
    const quartersBack = quartersMap[period] || 1;

    // Start date for FRED query (go back enough)
    const startYear = period === 'since1991' ? '1991-01-01' : '2018-01-01';

    if (view === 'national' || view === 'all') {
      // Fetch ALL states + US national
      const allCodes = ['US', ...Object.keys(STATE_SERIES).filter(k => k !== 'US')];
      const results = {};

      // Batch fetch - FRED doesn't support batch, so we fetch in parallel
      const promises = allCodes.map(async (code) => {
        try {
          const obs = await fetchFredSeries(STATE_SERIES[code], apiKey, startYear);
          let pctChange;
          if (period === 'since1991') {
            // Find earliest observation from 1991
            const earliest = obs[obs.length - 1];
            const latest = obs[0];
            if (earliest && latest) {
              pctChange = ((parseFloat(latest.value) - parseFloat(earliest.value)) / parseFloat(earliest.value) * 100);
            }
          } else {
            pctChange = calcPctChange(obs, quartersBack);
          }
          results[code] = {
            code,
            name: STATE_NAMES[code],
            change: pctChange !== null ? Math.round(pctChange * 100) / 100 : null,
            latestDate: obs[0] ? obs[0].date : null,
            latestValue: obs[0] ? parseFloat(obs[0].value) : null
          };
        } catch (e) {
          results[code] = { code, name: STATE_NAMES[code], change: null, error: e.message };
        }
      });

      await Promise.all(promises);

      // Calculate national average
      const national = results.US;

      return res.status(200).json({
        period,
        national,
        states: results,
        regions: REGIONS,
        fetchedAt: new Date().toISOString()
      });
    }

    if (view === 'state' && state) {
      // Single state detailed history
      const code = state.toUpperCase();
      const seriesId = STATE_SERIES[code];
      if (!seriesId) return res.status(400).json({ error: 'Invalid state code' });

      const obs = await fetchFredSeries(seriesId, apiKey, '1975-01-01');
      const usObs = await fetchFredSeries(STATE_SERIES.US, apiKey, '1975-01-01');

      return res.status(200).json({
        state: code,
        name: STATE_NAMES[code],
        history: obs.map(o => ({ date: o.date, value: parseFloat(o.value) })).reverse(),
        national: usObs.map(o => ({ date: o.date, value: parseFloat(o.value) })).reverse(),
        fetchedAt: new Date().toISOString()
      });
    }

    return res.status(400).json({ error: 'Invalid view parameter. Use: national, all, or state' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
