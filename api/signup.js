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
    const { fullName, email, brokerage, username, password } = req.body;

    if (!fullName || !email || !brokerage || !username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanUsername = username.toLowerCase().trim();

    // Validate username format
    if (!/^[a-z0-9._]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain lowercase letters, numbers, dots, and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Hash the password
    const hashedPassword = simpleHash(password);

    const readableTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Store user in Google Sheet via webhook
    // The Apps Script will check for duplicate usernames and store the user
    if (process.env.AUTH_SHEETS_WEBHOOK) {
      const sheetResponse = await fetch(process.env.AUTH_SHEETS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'signup',
          username: cleanUsername,
          password: hashedPassword,
          fullName: fullName,
          email: email,
          brokerage: brokerage,
          timestamp: readableTime
        })
      });

      const sheetResult = await sheetResponse.json();

      if (!sheetResult.success) {
        return res.status(409).json({ success: false, message: sheetResult.message || 'Username already taken' });
      }
    }

    // Track signup in Activity tab
    if (process.env.TRACKING_SHEETS_WEBHOOK) {
      try {
        await fetch(process.env.TRACKING_SHEETS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: readableTime,
            userName: fullName,
            userEmail: email,
            collection: 'Portal',
            tool: 'Authentication',
            action: 'New Signup',
            details: 'Brokerage: ' + brokerage
          })
        });
      } catch (e) {}
    }

    // Notify Kristy via Formspree
    try {
      const formBody = new URLSearchParams();
      formBody.append('_subject', 'New Agent Edge Partner Signup!');
      formBody.append('Full_Name', fullName);
      formBody.append('Email', email);
      formBody.append('Brokerage', brokerage);
      formBody.append('Username', cleanUsername);
      formBody.append('Signup_Date', readableTime);

      await fetch('https://formspree.io/f/mgoyyney', {
        method: 'POST',
        body: formBody,
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      user: {
        username: cleanUsername,
        name: fullName,
        email: email,
        brokerage: brokerage
      }
    });

  } catch (error) {
    console.error('Signup error:', error);
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
