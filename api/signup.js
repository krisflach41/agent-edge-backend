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
    const { fullName, email, brokerage, username, password } = req.body;

    if (!fullName || !email || !brokerage || !username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    // Validate username format
    if (!/^[a-z0-9._]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain lowercase letters, numbers, dots, and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Hash the password
    const hashedPassword = simpleHash(password);

    // Check for duplicate username or email
    const { data: existing } = await supabase
      .from('users')
      .select('username, email')
      .or(`username.eq.${cleanUsername},email.eq.${cleanEmail}`);

    if (existing && existing.length > 0) {
      const isDuplicateUsername = existing.some(u => u.username === cleanUsername);
      const isDuplicateEmail = existing.some(u => u.email === cleanEmail);
      
      if (isDuplicateUsername) {
        return res.status(409).json({ success: false, message: 'Username already taken' });
      }
      if (isDuplicateEmail) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }
    }

    // Create user in Supabase
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        username: cleanUsername,
        password: hashedPassword,
        email: cleanEmail,
        full_name: fullName,
        brokerage: brokerage,
        role: 'trial',
        is_admin: false,
        temp_password: false,
        trial_start_date: new Date().toISOString(),
        joined_date: new Date().toISOString()
      }])
      .select();

    if (insertError) {
      console.error('User insert error:', insertError);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }

    // Create CRM contact for new user
    try {
      await supabase
        .from('crm_contacts')
        .insert([{
          id: 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
          name: fullName,
          email: cleanEmail,
          company: brokerage,
          type: 'realtor',
          source: 'portal_signup',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
    } catch (crmError) {
      console.error('CRM contact creation failed:', crmError);
      // Non-critical, don't fail the signup
    }

    // Track signup activity
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'signup',
          subject: 'New Signup',
          body: 'Portal signup - Brokerage: ' + brokerage,
          date: new Date().toISOString()
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // Notify Kristy via Formspree
    try {
      const readableTime = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const formBody = new URLSearchParams();
      formBody.append('_subject', 'New Agent Edge Partner Signup!');
      formBody.append('Full_Name', fullName);
      formBody.append('Email', cleanEmail);
      formBody.append('Brokerage', brokerage);
      formBody.append('Username', cleanUsername);
      formBody.append('Signup_Date', readableTime);

      await fetch('https://formspree.io/f/mgoyyney', {
        method: 'POST',
        body: formBody,
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      console.error('Formspree notification failed:', e);
    }

    return res.status(200).json({
      success: true,
      user: {
        username: cleanUsername,
        name: fullName,
        email: cleanEmail,
        brokerage: brokerage
      },
      role: 'trial',
      trialStart: new Date().toISOString()
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
