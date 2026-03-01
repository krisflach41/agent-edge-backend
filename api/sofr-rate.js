export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var fredKey = process.env.FRED_API_KEY;
    if (!fredKey) return res.status(200).json({ rate: 4.33, source: 'default' });

    var url = 'https://api.stlouisfed.org/fred/series/observations?series_id=SOFR&api_key=' + fredKey + '&file_type=json&sort_order=desc&limit=1';
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('FRED API returned ' + resp.status);
    var data = await resp.json();

    if (data.observations && data.observations.length > 0) {
      var obs = data.observations[0];
      return res.status(200).json({
        rate: parseFloat(obs.value),
        date: obs.date,
        source: 'FRED SOFR'
      });
    }

    return res.status(200).json({ rate: 4.33, source: 'default' });
  } catch (err) {
    console.error('SOFR fetch error:', err);
    return res.status(200).json({ rate: 4.33, source: 'default', error: err.message });
  }
}
