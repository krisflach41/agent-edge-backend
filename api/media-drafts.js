// /api/media-drafts.js — save, load, delete drafts from Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function query(sql, params = []) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ query: sql, params })
  });
  return resp.json();
}

async function supabase(method, path, body) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'DELETE') return { success: true };
  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — load all drafts
    if (req.method === 'GET') {
      const data = await supabase('GET', 'media_drafts?order=created_at.desc&limit=50');
      return res.status(200).json({ success: true, drafts: data });
    }

    // POST — save a draft
    if (req.method === 'POST') {
      const { id, caption, platforms, photo_url, scheduled_time, directions, format, audience } = req.body;
      
      // If id provided, update existing
      if (id) {
        const data = await supabase('PATCH', `media_drafts?id=eq.${id}`, {
          caption, platforms, photo_url, scheduled_time, directions, format, audience,
          updated_at: new Date().toISOString()
        });
        return res.status(200).json({ success: true, draft: data });
      }

      // Otherwise insert new
      const data = await supabase('POST', 'media_drafts', {
        caption, platforms, photo_url, scheduled_time, directions, format, audience
      });
      return res.status(200).json({ success: true, draft: Array.isArray(data) ? data[0] : data });
    }

    // DELETE — remove a draft by id
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await supabase('DELETE', `media_drafts?id=eq.${id}`);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    return res.status(500).json({ error: 'Request failed', detail: err.message });
  }
}
