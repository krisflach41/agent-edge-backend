// /api/video-library.js — Manages video library entries in Supabase
// POST { action: 'save', videoId, title, category, description, visibility }
// GET  ?action=list&visibility=portal (or 'both', 'website', 'all')

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  var headers = {
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  // ===== GET: List published videos =====
  if (req.method === 'GET') {
    var visibility = req.query.visibility || 'portal';

    var filter = '';
    if (visibility === 'all') {
      filter = 'type=eq.youtube&order=created_at.desc';
    } else {
      // 'portal' matches 'portal' and 'both'; 'website' matches 'website' and 'both'
      filter = 'type=eq.youtube&or=(visibility.eq.' + visibility + ',visibility.eq.both)&order=created_at.desc';
    }

    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/media_library?' + filter + '&select=*', { headers: headers });
      var data = await resp.json();
      return res.status(200).json({ success: true, videos: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ===== POST: Save or delete a video =====
  if (req.method === 'POST') {
    var body = req.body || {};
    var action = body.action;

    if (action === 'save') {
      var record = {
        title: body.title || 'Untitled',
        category: body.category || 'General',
        description: body.description || '',
        visibility: body.visibility || 'portal',
        file_url: 'https://www.youtube.com/embed/' + body.videoId,
        file_name: body.videoId,
        type: 'youtube',
        created_at: new Date().toISOString()
      };

      try {
        var resp = await fetch(SUPABASE_URL + '/rest/v1/media_library', {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'return=representation' }),
          body: JSON.stringify(record)
        });
        var data = await resp.json();
        return res.status(200).json({ success: true, record: data });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'delete') {
      if (!body.id) return res.status(400).json({ error: 'id required' });
      try {
        await fetch(SUPABASE_URL + '/rest/v1/media_library?id=eq.' + body.id, {
          method: 'DELETE',
          headers: headers
        });
        return res.status(200).json({ success: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
