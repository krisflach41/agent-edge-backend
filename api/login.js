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
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const hashedPassword = simpleHash(password);

    // Query by email (email IS the username now)
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .eq('password', hashedPassword)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Block cancelled users
    if (user.role === 'cancelled') {
      return res.status(403).json({ success: false, message: 'This account has been deactivated. Contact Kristy at kflach@prmg.net to reactivate.' });
    }

    // Update last login timestamp
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('email', cleanEmail);

    // Track login in activity
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'login',
          subject: 'Portal Login',
          body: 'User logged into portal',
          date: new Date().toISOString()
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // Check if user has a headshot in CRM contacts
    let hasHeadshot = false;
    try {
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('headshot_url')
        .eq('id', cleanEmail)
        .single();
      hasHeadshot = !!(contact && contact.headshot_url);
    } catch (e) {
      // Non-critical
    }

    // Return user profile (never return password)
    return res.status(200).json({
      success: true,
      user: {
        username: cleanEmail,
        name: user.full_name,
        email: cleanEmail,
        brokerage: user.brokerage
      },
      tempPassword: user.temp_password || false,
      isAdmin: user.is_admin || false,
      role: user.role || 'trial',
      trialStart: user.trial_start_date || '',
      hasHeadshot: hasHeadshot
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
