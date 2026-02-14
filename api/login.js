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
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const hashedPassword = simpleHash(password);

    // Verify credentials against Google Sheet
    if (!process.env.AUTH_SHEETS_WEBHOOK) {
      return res.status(500).json({ success: false, message: 'Auth not configured' });
    }

    const sheetResponse = await fetch(process.env.AUTH_SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        username: cleanUsername,
        password: hashedPassword
      })
    });

    const sheetResult = await sheetResponse.json();

    if (!sheetResult.success) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Track login in Activity tab
    if (process.env.TRACKING_SHEETS_WEBHOOK) {
      try {
        const readableTime = new Date().toLocaleString('en-US', {
          timeZone: 'America/New_York',
          month: '2-digit',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        await fetch(process.env.TRACKING_SHEETS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: readableTime,
            userName: sheetResult.user.name,
            userEmail: sheetResult.user.email,
            collection: 'Portal',
            tool: 'Authentication',
            action: 'Login',
            details: 'Portal login'
          })
        });
      } catch (e) {}
    }

    // Return user profile (never return password)
    return res.status(200).json({
      success: true,
      user: {
        username: cleanUsername,
        name: sheetResult.user.name,
        email: sheetResult.user.email,
        brokerage: sheetResult.user.brokerage
      },
      tempPassword: sheetResult.tempPassword || false,
      isAdmin: sheetResult.isAdmin || false
    });

  } catch (error) {
    console.error('Login error:', error);
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
