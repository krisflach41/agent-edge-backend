// /api/design-studio.js — Save/load design projects and brand kit from Supabase

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ success: false, message: 'Supabase not configured' });

  var headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };
  var action = req.method === 'GET' ? (req.query.action || '') : (req.body && req.body.action || '');

  try {
    // ===== PROJECTS =====
    if (action === 'list_projects') {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/ds_projects?order=updated_at.desc&limit=50', { headers: headers });
      var data = await resp.json();
      return res.status(200).json({ success: true, projects: data || [] });
    }

    if (action === 'load_project') {
      var pid = req.method === 'GET' ? req.query.id : req.body.id;
      if (!pid) return res.status(400).json({ success: false, message: 'Project id required' });
      var resp = await fetch(SUPABASE_URL + '/rest/v1/ds_projects?id=eq.' + pid, { headers: headers });
      var data = await resp.json();
      if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
      return res.status(200).json({ success: true, project: data[0] });
    }

    if (action === 'save_project') {
      var p = req.body.project;
      if (!p || !p.name) return res.status(400).json({ success: false, message: 'Project name required' });

      var row = {
        name: p.name,
        canvas_type: p.canvas_type || 'flyer',
        canvas_w: p.canvas_w || 816,
        canvas_h: p.canvas_h || 1056,
        data: p.data || {},
        thumbnail: p.thumbnail || null,
        updated_at: new Date().toISOString()
      };

      if (p.id) {
        // Update existing
        await fetch(SUPABASE_URL + '/rest/v1/ds_projects?id=eq.' + p.id, {
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(row)
        });
        return res.status(200).json({ success: true, id: p.id });
      } else {
        // Insert new
        row.created_at = new Date().toISOString();
        var resp = await fetch(SUPABASE_URL + '/rest/v1/ds_projects', {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=representation' },
          body: JSON.stringify(row)
        });
        var data = await resp.json();
        return res.status(200).json({ success: true, id: data && data[0] ? data[0].id : null });
      }
    }

    if (action === 'delete_project') {
      var did = req.body.id;
      if (!did) return res.status(400).json({ success: false, message: 'Project id required' });
      await fetch(SUPABASE_URL + '/rest/v1/ds_projects?id=eq.' + did, { method: 'DELETE', headers: headers });
      return res.status(200).json({ success: true });
    }

    // ===== BRAND KIT =====
    if (action === 'get_brand') {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/ds_brand_kit?id=eq.default', { headers: headers });
      var data = await resp.json();
      if (data && data.length > 0) {
        return res.status(200).json({ success: true, brand: data[0] });
      }
      return res.status(200).json({ success: true, brand: null });
    }

    if (action === 'save_brand') {
      var b = req.body.brand;
      if (!b) return res.status(400).json({ success: false, message: 'Brand data required' });

      var row = {
        id: 'default',
        colors: b.colors || [],
        fonts: b.fonts || [],
        logos: b.logos || [],
        updated_at: new Date().toISOString()
      };

      // Check if exists
      var check = await fetch(SUPABASE_URL + '/rest/v1/ds_brand_kit?id=eq.default', { headers: headers });
      var existing = await check.json();

      if (existing && existing.length > 0) {
        await fetch(SUPABASE_URL + '/rest/v1/ds_brand_kit?id=eq.default', {
          method: 'PATCH', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(row)
        });
      } else {
        await fetch(SUPABASE_URL + '/rest/v1/ds_brand_kit', {
          method: 'POST', headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(row)
        });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('Design Studio API error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
