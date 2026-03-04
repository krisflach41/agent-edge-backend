export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ success: false, message: 'Supabase not configured' });
  }

  var action = req.query.action || (req.body && req.body.action);

  try {
    // CREATE ROOM - LO starts a call
    if (action === 'create-room') {
      var loName = req.body.lo_name || 'Loan Officer';
      var roomCode = 'CALL-' + Math.floor(1000 + Math.random() * 9000);

      var resp = await fetch(SUPABASE_URL + '/rest/v1/video_rooms', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          room_code: roomCode,
          lo_name: loName,
          status: 'waiting',
          created_at: new Date().toISOString()
        })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        return res.status(500).json({ success: false, message: 'Failed to create room: ' + errText });
      }

      var data = await resp.json();
      return res.status(200).json({ success: true, room_code: roomCode, room: data[0] });
    }

    // JOIN ROOM - Borrower enters code
    if (action === 'join-room') {
      var code = req.body.room_code || req.query.room_code;
      if (!code) return res.status(400).json({ success: false, message: 'Room code required' });

      var resp = await fetch(SUPABASE_URL + '/rest/v1/video_rooms?room_code=eq.' + encodeURIComponent(code) + '&status=eq.waiting&select=*', {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });

      var rooms = await resp.json();
      if (!rooms || rooms.length === 0) {
        return res.status(404).json({ success: false, message: 'Room not found or already in use' });
      }

      // Update status to active
      await fetch(SUPABASE_URL + '/rest/v1/video_rooms?id=eq.' + rooms[0].id, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'active' })
      });

      return res.status(200).json({ success: true, room: rooms[0] });
    }

    // SIGNAL - Exchange WebRTC offers/answers/ICE candidates
    if (action === 'signal') {
      var roomCode = req.body.room_code;
      var signalType = req.body.signal_type; // 'offer', 'answer', 'ice-candidate'
      var signalData = req.body.signal_data;
      var sender = req.body.sender; // 'lo' or 'borrower'

      var resp = await fetch(SUPABASE_URL + '/rest/v1/video_signals', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          room_code: roomCode,
          signal_type: signalType,
          signal_data: JSON.stringify(signalData),
          sender: sender,
          created_at: new Date().toISOString()
        })
      });

      if (!resp.ok) {
        var errText = await resp.text();
        return res.status(500).json({ success: false, message: 'Signal failed: ' + errText });
      }

      return res.status(200).json({ success: true });
    }

    // POLL SIGNALS - Get new signals for a room
    if (action === 'poll-signals') {
      var roomCode = req.query.room_code;
      var forUser = req.query.for_user; // 'lo' or 'borrower' - get signals NOT from this user
      var after = req.query.after || '2000-01-01T00:00:00Z';

      var senderFilter = forUser === 'lo' ? 'borrower' : 'lo';
      var url = SUPABASE_URL + '/rest/v1/video_signals?room_code=eq.' + encodeURIComponent(roomCode) + '&sender=eq.' + senderFilter + '&created_at=gt.' + encodeURIComponent(after) + '&order=created_at.asc&select=*';

      var resp = await fetch(url, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });

      var signals = await resp.json();
      return res.status(200).json({ success: true, signals: signals || [] });
    }

    // END ROOM
    if (action === 'end-room') {
      var roomCode = req.body.room_code;

      await fetch(SUPABASE_URL + '/rest/v1/video_rooms?room_code=eq.' + encodeURIComponent(roomCode), {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'ended' })
      });

      // Clean up signals
      await fetch(SUPABASE_URL + '/rest/v1/video_signals?room_code=eq.' + encodeURIComponent(roomCode), {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
