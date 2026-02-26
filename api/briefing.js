// /api/briefing.js - Read/write briefing data from Supabase
// GET  = portal reads current briefing (public)
// POST = admin saves updated briefing (requires admin password)

module.exports = async (req, res) => {
  // CORS
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

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // ===== GET: Read current briefing data =====
  if (req.method === 'GET') {
    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/briefing_data?id=eq.current&select=*', {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        }
      });
      var rows = await resp.json();
      if (!rows || rows.length === 0) {
        return res.status(200).json({});
      }
      var data = rows[0];
      return res.status(200).json({
        economicCalendar: data.economic_calendar || null,
        marketSummary: data.market_summary || '',
        clientFriendly: data.client_friendly || '',
        weekInReview: data.week_in_review || '',
        calendarWeek: data.calendar_week || '',
        lastUpdated: data.last_updated || ''
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read briefing: ' + err.message });
    }
  }

  // ===== POST: Save briefing data =====
  if (req.method === 'POST') {
    try {
      var body = req.body || {};
      
      // Build the update object — only include fields that were sent
      var update = { last_updated: new Date().toISOString() };
      
      if (body.economicCalendar !== undefined) {
        update.economic_calendar = body.economicCalendar;
      }
      if (body.marketSummary !== undefined) {
        update.market_summary = body.marketSummary;
      }
      if (body.clientFriendly !== undefined) {
        update.client_friendly = body.clientFriendly;
      }
      if (body.weekInReview !== undefined) {
        update.week_in_review = body.weekInReview;
      }
      if (body.calendarWeek !== undefined) {
        update.calendar_week = body.calendarWeek;
      }

      var resp = await fetch(SUPABASE_URL + '/rest/v1/briefing_data?id=eq.current', {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(update)
      });

      if (!resp.ok) {
        var errText = await resp.text();
        throw new Error('Supabase PATCH failed: ' + resp.status + ' ' + errText);
      }

      return res.status(200).json({ success: true, message: 'Briefing updated' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save briefing: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
