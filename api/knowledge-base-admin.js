// /api/knowledge-base-admin.js — CRUD for custom knowledge base entries
// Kristy can add, edit, and delete her own knowledge base entries via Mission Control.
// These are stored in Supabase table: knowledge_base_custom
//
// GET  → list all custom entries
// POST action=create  { title, content, keywords }  → create new entry
// POST action=update  { id, title, content, keywords }  → update entry
// POST action=delete  { id }  → delete entry
//
// Table schema (create in Supabase):
//   knowledge_base_custom
//     id          uuid  primary key default gen_random_uuid()
//     title       text  not null
//     content     text  not null
//     keywords    text  (comma-separated keywords for topic matching)
//     created_at  timestamptz  default now()
//     updated_at  timestamptz  default now()

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    // ===== GET: List all custom entries =====
    if (req.method === 'GET') {
      var resp = await fetch(
        SUPABASE_URL + '/rest/v1/knowledge_base_custom?order=created_at.asc&select=id,title,content,keywords,created_at,updated_at',
        { headers: headers }
      );

      if (!resp.ok) {
        var errText = await resp.text();
        // If table doesn't exist yet, return empty array instead of error
        if (errText.includes('does not exist') || errText.includes('relation')) {
          return res.status(200).json({ success: true, entries: [], tableNeeded: true });
        }
        return res.status(500).json({ error: 'Failed to fetch entries: ' + errText });
      }

      var entries = await resp.json();
      return res.status(200).json({ success: true, entries: Array.isArray(entries) ? entries : [] });
    }

    // ===== POST: Create, Update, Delete =====
    if (req.method === 'POST') {
      var body = req.body || {};
      var action = body.action;

      // CREATE
      if (action === 'create') {
        if (!body.title || !body.content) {
          return res.status(400).json({ error: 'title and content required' });
        }

        var newEntry = {
          title: body.title.trim(),
          content: body.content.trim(),
          keywords: (body.keywords || '').trim()
        };

        var resp = await fetch(SUPABASE_URL + '/rest/v1/knowledge_base_custom', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(newEntry)
        });

        if (!resp.ok) {
          var errText = await resp.text();
          return res.status(500).json({ error: 'Failed to create entry: ' + errText });
        }

        var result = await resp.json();
        return res.status(201).json({ success: true, entry: Array.isArray(result) ? result[0] : result });
      }

      // UPDATE
      if (action === 'update') {
        if (!body.id) return res.status(400).json({ error: 'id required' });

        var updates = { updated_at: new Date().toISOString() };
        if (body.title !== undefined) updates.title = body.title.trim();
        if (body.content !== undefined) updates.content = body.content.trim();
        if (body.keywords !== undefined) updates.keywords = (body.keywords || '').trim();

        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/knowledge_base_custom?id=eq.' + body.id,
          {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify(updates)
          }
        );

        if (!resp.ok) {
          var errText = await resp.text();
          return res.status(500).json({ error: 'Failed to update entry: ' + errText });
        }

        var result = await resp.json();
        return res.status(200).json({ success: true, entry: Array.isArray(result) ? result[0] : result });
      }

      // DELETE
      if (action === 'delete') {
        if (!body.id) return res.status(400).json({ error: 'id required' });

        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/knowledge_base_custom?id=eq.' + body.id,
          {
            method: 'DELETE',
            headers: headers
          }
        );

        if (!resp.ok) {
          var errText = await resp.text();
          return res.status(500).json({ error: 'Failed to delete entry: ' + errText });
        }

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('knowledge-base-admin error:', err);
    return res.status(500).json({ error: err.message });
  }
}
