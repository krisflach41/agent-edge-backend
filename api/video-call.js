// /api/video-call.js — Daily.co video call room management
// POST action=create-room  → creates Daily.co room, stores code in Supabase
// POST action=join-room    → borrower enters code, gets back the Daily.co room URL
// POST action=delete-room  → cleans up after call ends

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var DAILY_API_KEY = process.env.DAILY_API_KEY;
  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!DAILY_API_KEY) return res.status(500).json({ error: 'Daily API key not configured' });

  var sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  var DAILY_API = 'https://api.daily.co/v1';

  try {
    if (req.method === 'POST') {
      var body = req.body || {};
      var action = body.action;

      // CREATE ROOM — LO starts a call
      if (action === 'create-room') {
        var exp = Math.floor(Date.now() / 1000) + (4 * 60 * 60);
        var roomName = 'ae-' + Date.now();
        var roomCode = String(Math.floor(10000 + Math.random() * 90000)); // 5-digit code

        // Create room in Daily.co
        var dailyResp = await fetch(DAILY_API + '/rooms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + DAILY_API_KEY
          },
          body: JSON.stringify({
            name: roomName,
            properties: {
              exp: exp,
              enable_screenshare: true,
              enable_chat: false,
              start_video_off: false,
              start_audio_off: false,
              max_participants: 25,
              enable_knocking: true
            }
          })
        });

        var room = await dailyResp.json();
        if (!room.url) return res.status(500).json({ error: 'Failed to create Daily room', details: room });

        // Store code → room URL mapping in Supabase
        await fetch(SUPABASE_URL + '/rest/v1/video_rooms', {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({
            room_code: roomCode,
            room_name: roomName,
            room_url: room.url,
            lo_name: body.lo_name || 'Kristy Flach',
            created_at: new Date().toISOString(),
            expires_at: new Date(exp * 1000).toISOString()
          })
        });

        return res.status(200).json({
          success: true,
          room_code: roomCode,
          room_name: roomName,
          room_url: room.url
        });
      }

      // JOIN ROOM — borrower enters code, gets Daily URL
      if (action === 'join-room') {
        var code = body.room_code;
        if (!code) return res.status(400).json({ error: 'room_code required' });

        var sbResp = await fetch(
          SUPABASE_URL + '/rest/v1/video_rooms?room_code=eq.' + encodeURIComponent(code) + '&select=*',
          { headers: sbHeaders }
        );
        var rows = await sbResp.json();

        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Room not found. Check the code and try again.' });
        }

        var roomRow = rows[0];

        // Check not expired
        if (new Date(roomRow.expires_at) < new Date()) {
          return res.status(410).json({ success: false, message: 'This room has expired. Ask your loan officer to start a new call.' });
        }

        return res.status(200).json({
          success: true,
          room_url: roomRow.room_url,
          lo_name: roomRow.lo_name
        });
      }

      // DELETE ROOM — cleanup after call ends
      if (action === 'delete-room') {
        var roomName = body.room_name;
        var roomCode = body.room_code;

        if (roomName) {
          await fetch(DAILY_API + '/rooms/' + roomName, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + DAILY_API_KEY }
          });
        }

        if (roomCode) {
          await fetch(SUPABASE_URL + '/rest/v1/video_rooms?room_code=eq.' + encodeURIComponent(roomCode), {
            method: 'DELETE',
            headers: sbHeaders
          });
        }

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
