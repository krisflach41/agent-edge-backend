// /api/teleprompter.js — Save, list, and delete teleprompter scripts
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  res.setHeader('Access-Control-Allow-Origin', allowed.indexOf(origin) !== -1 ? origin : 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  var supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // GET — list all scripts, newest first
    if (req.method === 'GET') {
      var { data, error } = await supabase
        .from('teleprompter_scripts')
        .select('id, title, source, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, scripts: data || [] });
    }

    // POST — save or delete
    if (req.method === 'POST') {
      var body = req.body || {};
      var action = body.action;

      if (action === 'save') {
        var title = body.title || 'Untitled Script';
        var scriptBody = body.body;
        var source = body.source || 'manual';
        if (!scriptBody) return res.status(400).json({ success: false, error: 'body required' });

        if (body.id) {
          // Update existing
          var { data, error } = await supabase
            .from('teleprompter_scripts')
            .update({ title: title, body: scriptBody, source: source, updated_at: new Date().toISOString() })
            .eq('id', body.id)
            .select();
          if (error) return res.status(500).json({ success: false, error: error.message });
          return res.status(200).json({ success: true, script: data[0] });
        } else {
          // Insert new
          var { data, error } = await supabase
            .from('teleprompter_scripts')
            .insert({ title: title, body: scriptBody, source: source })
            .select();
          if (error) return res.status(500).json({ success: false, error: error.message });
          return res.status(200).json({ success: true, script: data[0] });
        }
      }

      if (action === 'get') {
        var id = body.id;
        if (!id) return res.status(400).json({ success: false, error: 'id required' });
        var { data, error } = await supabase
          .from('teleprompter_scripts')
          .select('*')
          .eq('id', id)
          .single();
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, script: data });
      }

      if (action === 'delete') {
        var id = body.id;
        if (!id) return res.status(400).json({ success: false, error: 'id required' });
        var { error } = await supabase
          .from('teleprompter_scripts')
          .delete()
          .eq('id', id);
        if (error) return res.status(500).json({ success: false, error: error.message });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
