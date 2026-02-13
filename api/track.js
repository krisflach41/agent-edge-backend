// api/track.js
// Universal activity tracker for Agent Edge Portal
// Logs all portal activity to Google Sheets

const { google } = require('googleapis');

async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userName, userEmail, collection, tool, action, details } = req.body;

    if (!userName || !action) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const sheets = await getSheet();
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.TRACKING_SHEET_ID,
      range: 'Activity!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          timestamp,
          userName || '',
          userEmail || '',
          collection || '',
          tool || '',
          action || '',
          details || ''
        ]]
      }
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Tracking error:', error);
    // Don't fail silently - but don't break the user experience either
    return res.status(200).json({ success: false, message: 'Tracking failed silently' });
  }
}
