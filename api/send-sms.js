// /api/send-sms.js — Telnyx SMS endpoint for Agent Edge
// Sends SMS alerts via Telnyx API V2

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { to, message } = req.body;
    if (!to || !message) {
      return res.status(400).json({ error: 'Missing "to" and/or "message"' });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_FROM_NUMBER;
    if (!apiKey || !fromNumber) {
      return res.status(500).json({ error: 'Telnyx not configured' });
    }

    // Clean phone number — ensure +1 format
    let cleanTo = to.replace(/[^0-9+]/g, '');
    if (!cleanTo.startsWith('+')) {
      if (cleanTo.startsWith('1') && cleanTo.length === 11) {
        cleanTo = '+' + cleanTo;
      } else if (cleanTo.length === 10) {
        cleanTo = '+1' + cleanTo;
      }
    }

    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: fromNumber,
        to: cleanTo,
        text: message
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx error:', JSON.stringify(data));
      return res.status(response.status).json({ error: 'SMS failed', detail: data });
    }

    return res.status(200).json({ success: true, message_id: data.data?.id || 'sent' });

  } catch (err) {
    console.error('send-sms error:', err);
    return res.status(500).json({ error: err.message });
  }
};
