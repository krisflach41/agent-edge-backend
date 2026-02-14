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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Generate a random temporary password
    const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 8).toUpperCase() + Math.floor(Math.random() * 99);

    // Hash the temp password for storage
    const hashedTemp = simpleHash(tempPassword);

    // Send to Auth Apps Script to look up email and update password
    if (!process.env.AUTH_SHEETS_WEBHOOK) {
      return res.status(500).json({ success: false, message: 'Auth not configured' });
    }

    const sheetResponse = await fetch(process.env.AUTH_SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resetPassword',
        email: email.toLowerCase().trim(),
        newPassword: hashedTemp
      })
    });

    const sheetResult = await sheetResponse.json();

    if (!sheetResult.success) {
      // Don't reveal whether email exists or not (security)
      return res.status(200).json({ 
        success: true, 
        message: 'If an account with that email exists, a password reset has been sent.' 
      });
    }

    // Send email via Resend
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
          },
          body: JSON.stringify({
            from: 'Agent Edge <noreply@kristyflach.com>',
            to: [email],
            subject: 'Your Agent Edge Password Reset',
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #f8f9fa; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #002556; font-size: 24px; margin: 0;">Agent Edge Partner Portal</h1>
                  <p style="color: #666; font-size: 14px; margin-top: 8px;">Password Reset</p>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                  <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 0;">Hi ${sheetResult.userName || 'there'},</p>
                  
                  <p style="color: #333; font-size: 15px; line-height: 1.6;">A password reset was requested for your account. Here is your temporary password:</p>
                  
                  <div style="background: #002556; color: white; padding: 18px 24px; border-radius: 8px; text-align: center; margin: 24px 0; font-size: 22px; letter-spacing: 2px; font-weight: 700;">
                    ${tempPassword}
                  </div>
                  
                  <p style="color: #333; font-size: 15px; line-height: 1.6;">Use this to log in. You will be asked to create a new password immediately after logging in.</p>
                  
                  <p style="color: #999; font-size: 13px; line-height: 1.6; margin-bottom: 0;">If you did not request this reset, please contact Kristy immediately.</p>
                </div>
                
                <div style="text-align: center; margin-top: 24px;">
                  <a href="https://kristyflach.com/login.html" style="display: inline-block; padding: 12px 30px; background: #002556; color: white; text-decoration: none; border-radius: 25px; font-weight: 600; font-size: 14px;">Log In Now</a>
                </div>
                
                <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 30px;">Agent Edge Partner Portal | kristyflach.com</p>
              </div>
            `
          })
        });
      } catch (emailError) {
        console.error('Email send failed:', emailError);
      }
    }

    // Track password reset in Activity
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
            userName: sheetResult.userName || 'Unknown',
            userEmail: email,
            collection: 'Portal',
            tool: 'Authentication',
            action: 'Password Reset',
            details: 'Temporary password issued'
          })
        });
      } catch (e) {}
    }

    // Always return the same message (don't reveal if email exists)
    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset has been sent.'
    });

  } catch (error) {
    console.error('Password reset error:', error);
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
