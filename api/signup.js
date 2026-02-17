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
    const { fullName, email, brokerage, password } = req.body;

    if (!fullName || !email || !brokerage || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    // Hash the password
    const hashedPassword = simpleHash(password);

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('email')
      .eq('email', cleanEmail);

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Try signing in instead.' });
    }

    const now = new Date().toISOString();

    // ===== STEP 1: Create CRM contact FIRST (email is the ID) =====
    // This must happen before activity tracking since crm_activity has a foreign key to crm_contacts
    const { error: crmError } = await supabase
      .from('crm_contacts')
      .insert([{
        id: cleanEmail,
        name: fullName,
        email: cleanEmail,
        company: brokerage,
        type: 'realtor',
        source: 'portal_signup',
        created_at: now,
        updated_at: now
      }]);

    if (crmError) {
      console.error('CRM contact creation failed:', crmError);
      // If it's a duplicate, that's okay — contact already exists
      if (crmError.code !== '23505') {
        return res.status(500).json({ success: false, message: 'Failed to create account. Please try again.' });
      }
    }

    // ===== STEP 2: Create user record =====
    // Email is also the username — no separate username needed
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        username: cleanEmail,
        password: hashedPassword,
        email: cleanEmail,
        full_name: fullName,
        brokerage: brokerage,
        role: 'trial',
        is_admin: false,
        temp_password: false,
        trial_start_date: now,
        joined_date: now
      }])
      .select();

    if (insertError) {
      console.error('User insert error:', insertError);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }

    // ===== STEP 3: Track signup activity =====
    // Now this will work because crm_contact exists with email as ID
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'signup',
          subject: 'New Trial Signup',
          body: 'Portal trial signup - Brokerage: ' + brokerage,
          date: now
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // ===== STEP 4: Notify Kristy =====
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
      formBody.append('_subject', 'New Agent Edge Trial Signup!');
      formBody.append('Full_Name', fullName);
      formBody.append('Email', cleanEmail);
      formBody.append('Brokerage', brokerage);
      formBody.append('Account_Type', '7-Day Trial');
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
        username: cleanEmail,
        name: fullName,
        email: cleanEmail,
        brokerage: brokerage
      },
      role: 'trial',
      trialStart: now
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
