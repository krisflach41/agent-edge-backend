import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {

    // ===== GET: Query endpoints =====
    if (req.method === 'GET') {
      var action = req.query.action || '';

      // --- WHO'S ONLINE (active in last 15 min) ---
      if (action === 'online') {
        var loId = req.query.lo_user_id || 'default';
        var cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        const { data, error } = await supabase
          .from('ae_sessions')
          .select('user_email, user_name, last_active, last_page, pages_visited')
          .eq('lo_user_id', loId)
          .eq('is_admin', false)
          .gte('last_active', cutoff)
          .order('last_active', { ascending: false });

        if (error) return res.status(500).json({ success: false, message: error.message });

        var seen = {};
        var unique = (data || []).filter(function(s) {
          if (seen[s.user_email]) return false;
          seen[s.user_email] = true;
          return true;
        });

        return res.status(200).json({ success: true, online: unique, count: unique.length });
      }

      // --- ACTIVE USERS (24h, 7d, 30d) ---
      if (action === 'active_users') {
        var loId2 = req.query.lo_user_id || 'default';
        var period = req.query.period || '24h';
        var ms = period === '7d' ? 7*86400000 : period === '30d' ? 30*86400000 : 86400000;
        var since = new Date(Date.now() - ms).toISOString();

        const { data, error } = await supabase
          .from('ae_sessions')
          .select('user_email, user_name, last_active, pages_visited')
          .eq('lo_user_id', loId2)
          .eq('is_admin', false)
          .gte('last_active', since)
          .order('last_active', { ascending: false });

        if (error) return res.status(500).json({ success: false, message: error.message });

        var seen2 = {};
        var unique2 = (data || []).filter(function(s) {
          if (seen2[s.user_email]) return false;
          seen2[s.user_email] = true;
          return true;
        });

        return res.status(200).json({ success: true, users: unique2, count: unique2.length });
      }

      // --- REALTOR ACTIVITY (events for a specific user) ---
      if (action === 'user_activity') {
        var email = req.query.email || '';
        var loId3 = req.query.lo_user_id || 'default';
        var limit = parseInt(req.query.limit) || 50;

        if (!email) return res.status(400).json({ success: false, message: 'email required' });

        const { data, error } = await supabase
          .from('ae_tracking_events')
          .select('*')
          .eq('user_email', email)
          .eq('lo_user_id', loId3)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, events: data || [] });
      }

      // --- ROLLUP STATS ---
      if (action === 'rollup_stats') {
        var loId4 = req.query.lo_user_id || 'default';
        var days = parseInt(req.query.days) || 30;
        var since2 = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('ae_tracking_rollups')
          .select('*')
          .eq('lo_user_id', loId4)
          .gte('roll_date', since2)
          .order('roll_date', { ascending: false });

        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, rollups: data || [] });
      }

      return res.status(400).json({ success: false, message: 'Unknown GET action. Use: online, active_users, user_activity, rollup_stats' });
    }

    // ===== POST: Track event =====
    if (req.method === 'POST') {
      var body = req.body || {};

      // --- NIGHTLY ROLLUP (called by cron) ---
      if (body.action === 'build_rollup') {
        return await buildDailyRollup(res);
      }

      var sessionId = body.sessionId || '';
      var userName = body.userName || '';
      var userEmail = body.userEmail || '';
      var loUserId = body.loUserId || 'default';
      var isAdmin = body.isAdmin || false;
      var collection = body.collection || '';
      var tool = body.tool || '';
      var eventAction = body.action || '';
      var details = body.details || '';
      var page = body.page || '';

      if (!userEmail && !sessionId) {
        return res.status(200).json({ success: true, skipped: true });
      }

      var cleanEmail = userEmail.toLowerCase().trim();

      // 1. UPSERT SESSION
      if (sessionId && cleanEmail) {
        try {
          const { data: existing } = await supabase
            .from('ae_sessions')
            .select('id, pages_visited')
            .eq('session_id', sessionId)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('ae_sessions')
              .update({
                last_active: new Date().toISOString(),
                pages_visited: (existing.pages_visited || 0) + (eventAction === 'Page Visit' ? 1 : 0),
                last_page: page || tool || ''
              })
              .eq('session_id', sessionId);
          } else {
            await supabase
              .from('ae_sessions')
              .insert({
                session_id: sessionId,
                user_email: cleanEmail,
                user_name: userName,
                lo_user_id: loUserId,
                started_at: new Date().toISOString(),
                last_active: new Date().toISOString(),
                pages_visited: 1,
                last_page: page || tool || '',
                is_admin: isAdmin
              });
          }
        } catch (sessErr) {
          console.error('Session upsert error:', sessErr);
        }
      }

      // 2. LOG EVENT
      if (cleanEmail && eventAction) {
        try {
          await supabase
            .from('ae_tracking_events')
            .insert({
              session_id: sessionId,
              user_email: cleanEmail,
              user_name: userName,
              lo_user_id: loUserId,
              collection: collection,
              tool: tool,
              action: eventAction,
              details: details
            });
        } catch (evtErr) {
          console.error('Event insert error:', evtErr);
        }
      }

      // 3. BACKWARD COMPAT — also write to crm_activity
      if (cleanEmail && eventAction) {
        try {
          await supabase
            .from('crm_activity')
            .insert([{
              crm_id: cleanEmail,
              type: (collection || tool || 'activity').toLowerCase().replace(/\s+/g, '_'),
              subject: eventAction,
              body: details ? (collection + ' ' + tool + ': ' + details).trim() : (collection + ' ' + tool).trim(),
              date: new Date().toISOString()
            }]);
        } catch (e) {}
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Tracking error:', error);
    return res.status(200).json({ success: false, message: 'Tracking failed silently' });
  }
}

// ===== NIGHTLY ROLLUP =====
async function buildDailyRollup(res) {
  try {
    var yesterday = new Date(Date.now() - 86400000);
    var dateStr = yesterday.toISOString().split('T')[0];
    var dayStart = dateStr + 'T00:00:00.000Z';
    var dayEnd = dateStr + 'T23:59:59.999Z';

    const { data: events, error } = await supabase
      .from('ae_tracking_events')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);

    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!events || events.length === 0) return res.status(200).json({ success: true, message: 'No events to roll up' });

    var rollups = {};
    events.forEach(function(ev) {
      var key = ev.lo_user_id + '::' + ev.user_email;
      if (!rollups[key]) {
        rollups[key] = {
          lo_user_id: ev.lo_user_id,
          user_email: ev.user_email,
          user_name: ev.user_name || '',
          roll_date: dateStr,
          page_visits: 0,
          unique_pages: {},
          downloads: 0,
          prints: 0,
          orders: 0,
          time_spent_seconds: 0,
          collections: {}
        };
      }
      var r = rollups[key];
      if (ev.action === 'Page Visit') { r.page_visits++; r.unique_pages[ev.tool] = true; }
      if (ev.action === 'Download') r.downloads++;
      if (ev.action === 'Print') r.prints++;
      if (ev.action === 'Order Submitted' || ev.action === 'Form Submit') r.orders++;
      if (ev.action === 'Time Spent') { r.time_spent_seconds += (parseInt(ev.details) || 0); }
      if (ev.collection) r.collections[ev.collection] = (r.collections[ev.collection] || 0) + 1;
    });

    var rows = Object.values(rollups).map(function(r) {
      var topCol = ''; var topCount = 0;
      for (var c in r.collections) {
        if (r.collections[c] > topCount) { topCol = c; topCount = r.collections[c]; }
      }
      return {
        lo_user_id: r.lo_user_id,
        user_email: r.user_email,
        user_name: r.user_name,
        roll_date: r.roll_date,
        page_visits: r.page_visits,
        unique_pages: Object.keys(r.unique_pages).length,
        downloads: r.downloads,
        prints: r.prints,
        orders: r.orders,
        time_spent_seconds: r.time_spent_seconds,
        top_collection: topCol,
        top_tool: ''
      };
    });

    const { error: upsertErr } = await supabase
      .from('ae_tracking_rollups')
      .upsert(rows, { onConflict: 'lo_user_id,user_email,roll_date' });

    if (upsertErr) return res.status(500).json({ success: false, message: upsertErr.message });
    return res.status(200).json({ success: true, rolled_up: rows.length });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
