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
    const { name, email, timestamp, acknowledged, ipAddress, userAgent } = req.body;

    // Get actual IP address
    const realIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'Unknown';

    const readableTime = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Log to Google Sheets
    if (process.env.GOOGLE_SHEETS_WEBHOOK_SIMULATOR) {
      try {
        await fetch(process.env.GOOGLE_SHEETS_WEBHOOK_SIMULATOR, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ACCESS',
            name,
            email,
            acknowledged: 'YES',
            ipAddress: realIP,
            userAgent,
            timestamp: readableTime
          })
        });
      } catch (sheetError) {
        console.error('Google Sheets logging failed:', sheetError);
      }
    }

    console.log('Simulator Access Logged:', { name, email, ip: realIP, timestamp: readableTime });

    return res.status(200).json({
      success: true,
      message: 'Access logged'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Logging failed',
      message: error.message 
    });
  }
}
