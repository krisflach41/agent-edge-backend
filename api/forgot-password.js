import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

    const cleanEmail = email.toLowerCase().trim();

    // Look up user by email in Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    // Don't reveal whether email exists or not (security)
    if (error || !user) {
      return res.status(200).json({ 
        success: true, 
        message: 'If an account with that email exists, a password reset has been sent.' 
      });
    }

    // Generate a random temporary password
    const tempPassword = 'Temp' + Math.random().toString(36).substring(2, 8).toUpperCase() + Math.floor(Math.random() * 99);

    // Hash the temp password for storage
    const hashedTemp = simpleHash(tempPassword);

    // Update user with temp password in Supabase
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        password: hashedTemp,
        temp_password: true,
        updated_at: new Date().toISOString()
      })
      .eq('email', cleanEmail);

    if (updateError) {
      console.error('Failed to update password:', updateError);
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
            to: [cleanEmail],
            subject: 'Your Agent Edge Password Reset',
            html: `
              <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; background: #f8f9fa; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 30px;">
                  <h1 style="color: #002556; font-size: 24px; margin: 0;">Agent Edge Partner Portal</h1>
                  <p style="color: #666; font-size: 14px; margin-top: 8px;">Password Reset</p>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                  <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 0;">Hi ${user.full_name || 'there'},</p>
                  
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

    // Track password reset in Supabase activity
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'password_reset',
          subject: 'Password Reset',
          body: 'Temporary password issued',
          date: new Date().toISOString()
        }]);
    } catch (e) {
      console.error('Activity tracking failed:', e);
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
