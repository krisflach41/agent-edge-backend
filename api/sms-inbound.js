// /api/sms-inbound.js — Telnyx inbound SMS webhook
// Receives replies to the Agent Edge Telnyx number and forwards them to Kristy's phone

module.exports = async (req, res) => {
  // Telnyx sends POST for inbound messages
  if (req.method !== 'POST') return res.status(200).end();

  try {
    var payload = req.body;

    // Telnyx webhook structure: { data: { event_type: 'message.received', payload: { from: {...}, text: '...' } } }
    var eventType = '';
    var msgData = {};

    if (payload && payload.data) {
      eventType = payload.data.event_type || '';
      msgData = payload.data.payload || {};
    }

    // Only handle inbound messages
    if (eventType !== 'message.received') {
      return res.status(200).json({ received: true, skipped: eventType || 'no event_type' });
    }

    var fromNumber = (msgData.from && msgData.from.phone_number) || '';
    var messageText = msgData.text || '';

    if (!fromNumber || !messageText) {
      return res.status(200).json({ received: true, skipped: 'no from or text' });
    }

    // Format the from number for display
    var displayFrom = fromNumber;
    var digits = fromNumber.replace(/[^0-9]/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.substring(1);
    if (digits.length === 10) {
      displayFrom = '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6);
    }

    // Build the forwarded message
    var forwardMsg = '\ud83d\udd14 AGENT EDGE REPLY\nFrom: ' + displayFrom + '\n\n' + messageText;

    // Forward to Kristy's phone
    var apiKey = process.env.TELNYX_API_KEY;
    var fromNum = process.env.TELNYX_FROM_NUMBER;
    var kristyPhone = '+12063135883';

    if (!apiKey || !fromNum) {
      console.error('sms-inbound: Telnyx not configured');
      return res.status(200).json({ received: true, error: 'Telnyx not configured' });
    }

    var response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        from: fromNum,
        to: kristyPhone,
        text: forwardMsg
      })
    });

    var data = await response.json();

    if (!response.ok) {
      console.error('sms-inbound forward error:', JSON.stringify(data));
      return res.status(200).json({ received: true, forwarded: false, error: data });
    }

    return res.status(200).json({ received: true, forwarded: true, from: fromNumber });

  } catch (err) {
    console.error('sms-inbound error:', err);
    // Always return 200 so Telnyx doesn't retry
    return res.status(200).json({ received: true, error: err.message });
  }
};
