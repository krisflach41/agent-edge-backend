// /api/briefing.js - Read/write briefing data from Supabase
// GET  = read current briefing (public) or weekly history (?action=history)
// POST = save updated briefing + log to history

module.exports = async (req, res) => {
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

  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  // ===== GET =====
  if (req.method === 'GET') {
    var action = req.query.action;

    // Weekly history for Week in Review generation
    if (action === 'history') {
      try {
        var now = new Date();
        var dayOfWeek = now.getDay();
        var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        var monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        var mondayStr = monday.toISOString().split('T')[0];
        var todayStr = now.toISOString().split('T')[0];

        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/briefing_history?publish_date=gte.' + mondayStr + '&publish_date=lte.' + todayStr + '&order=publish_date.asc&select=publish_date,market_summary,client_friendly',
          { headers: headers }
        );
        var rows = await resp.json();

        return res.status(200).json({
          weekStart: mondayStr,
          weekEnd: todayStr,
          days: Array.isArray(rows) ? rows : []
        });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to read history: ' + err.message });
      }
    }

    // Default: read current briefing
    try {
      var resp = await fetch(SUPABASE_URL + '/rest/v1/briefing_data?id=eq.current&select=*', { headers: headers });
      var rows = await resp.json();
      if (!rows || rows.length === 0) return res.status(200).json({});
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

  // ===== POST =====
  if (req.method === 'POST') {
    try {
      var body = req.body || {};

      // Build update for current briefing
      var update = { last_updated: new Date().toISOString() };

      if (body.economicCalendar !== undefined) update.economic_calendar = body.economicCalendar;
      if (body.marketSummary !== undefined) update.market_summary = body.marketSummary;
      if (body.clientFriendly !== undefined) update.client_friendly = body.clientFriendly;
      if (body.weekInReview !== undefined) update.week_in_review = body.weekInReview;
      if (body.calendarWeek !== undefined) update.calendar_week = body.calendarWeek;

      // Update current briefing
      var resp = await fetch(SUPABASE_URL + '/rest/v1/briefing_data?id=eq.current', {
        method: 'PATCH',
        headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(update)
      });

      if (!resp.ok) {
        var errText = await resp.text();
        throw new Error('Supabase PATCH failed: ' + resp.status + ' ' + errText);
      }

      // Also log to history if we have summaries (for Week in Review generation)
      if (body.marketSummary || body.clientFriendly) {
        var today = new Date().toISOString().split('T')[0];

        // Check if we already have an entry for today
        var existResp = await fetch(
          SUPABASE_URL + '/rest/v1/briefing_history?publish_date=eq.' + today + '&select=id',
          { headers: headers }
        );
        var existing = await existResp.json();

        var historyRow = { publish_date: today };
        if (body.marketSummary) historyRow.market_summary = body.marketSummary;
        if (body.clientFriendly) historyRow.client_friendly = body.clientFriendly;
        if (body.economicCalendar) historyRow.economic_calendar = body.economicCalendar;
        if (body.calendarWeek) historyRow.calendar_week = body.calendarWeek;

        if (existing && existing.length > 0) {
          // Update today's row
          await fetch(SUPABASE_URL + '/rest/v1/briefing_history?publish_date=eq.' + today, {
            method: 'PATCH',
            headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify(historyRow)
          });
        } else {
          // Insert new row
          await fetch(SUPABASE_URL + '/rest/v1/briefing_history', {
            method: 'POST',
            headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify(historyRow)
          });
        }
      }

      return res.status(200).json({ success: true, message: 'Briefing updated' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save briefing: ' + err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
