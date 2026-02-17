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
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const hashedPassword = simpleHash(password);

    // Query Supabase users table
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', cleanUsername)
      .eq('password', hashedPassword)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Update last login timestamp
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('username', cleanUsername);

    // Track login in activity
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: user.email,
          type: 'login',
          subject: 'Portal Login',
          body: 'User logged into portal',
          date: new Date().toISOString()
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // Return user profile (never return password)
    return res.status(200).json({
      success: true,
      user: {
        username: user.username,
        name: user.full_name,
        email: user.email,
        brokerage: user.brokerage
      },
      tempPassword: user.temp_password || false,
      isAdmin: user.is_admin || false,
      role: user.role || 'trial',
      trialStart: user.trial_start_date || ''
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
