// /api/unsplash-search.js — Unsplash image search + download trigger

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return res.status(500).json({ error: 'UNSPLASH_ACCESS_KEY not configured' });

  const { query, per_page, download } = req.query;

  // Trigger download (required by Unsplash API terms)
  if (download) {
    await fetch(`https://api.unsplash.com/photos/${download}/download`, {
      headers: { Authorization: `Client-ID ${key}` }
    });
    return res.status(200).json({ ok: true });
  }

  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const resp = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${per_page || 12}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } }
    );
    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Unsplash request failed', detail: err.message });
  }
}
