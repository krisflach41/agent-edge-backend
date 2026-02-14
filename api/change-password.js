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
    const { username, newPassword } = req.body;

    if (!username || !newPassword) {
      return res.status(400).json({ success: false, message: 'Username and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashedPassword = simpleHash(newPassword);

    // Update password in Google Sheet
    const sheetResponse = await fetch(process.env.AUTH_SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'changePassword',
        username: username.toLowerCase().trim(),
        newPassword: hashedPassword
      })
    });

    const sheetResult = await sheetResponse.json();

    if (!sheetResult.success) {
      return res.status(400).json({ success: false, message: 'Failed to update password' });
    }

    return res.status(200).json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
