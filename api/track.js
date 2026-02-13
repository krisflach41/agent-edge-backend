export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userName, userEmail, collection, tool, action, details } = req.body;

    const readableTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Log to Google Sheets via webhook
    if (process.env.TRACKING_SHEETS_WEBHOOK) {
      try {
        await fetch(process.env.TRACKING_SHEETS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: readableTime,
            userName: userName || '',
            userEmail: userEmail || '',
            collection: collection || '',
            tool: tool || '',
            action: action || '',
            details: details || ''
          })
        });
      } catch (sheetError) {
        console.error('Tracking sheet logging failed:', sheetError);
      }
    }

    console.log('Activity Tracked:', { userName, action, collection, tool, timestamp: readableTime });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Tracking error:', error);
    return res.status(200).json({ success: false, message: 'Tracking failed silently' });
  }
}
