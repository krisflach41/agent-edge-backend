import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
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
    const { email, licenseNumber, phone, address, city, state, zip, headshot } = req.body;

    if (!email || !licenseNumber || !phone || !address || !city || !state || !zip) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const now = new Date().toISOString();

    // ===== STEP 1: Update CRM contact with partner info =====
    const { error: crmError } = await supabase
      .from('crm_contacts')
      .update({
        license_number: licenseNumber,
        phone: phone,
        address: address,
        city: city,
        state: state.toUpperCase(),
        zip: zip,
        headshot_url: headshot || null,
        updated_at: now
      })
      .eq('id', cleanEmail);

    if (crmError) {
      console.error('CRM update failed:', crmError);
      return res.status(500).json({ success: false, message: 'Failed to update your profile' });
    }

    // ===== STEP 2: Upgrade user role to partner =====
    const { error: userError } = await supabase
      .from('users')
      .update({
        role: 'partner',
        last_login: now
      })
      .eq('email', cleanEmail);

    if (userError) {
      console.error('User role update failed:', userError);
      return res.status(500).json({ success: false, message: 'Failed to upgrade your account' });
    }

    // ===== STEP 3: Track conversion activity =====
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'conversion',
          subject: 'Trial Converted to Partner',
          body: 'User upgraded from trial to partner membership. License: ' + licenseNumber,
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

      // Get user name for notification
      const { data: userData } = await supabase
        .from('users')
        .select('full_name, brokerage')
        .eq('email', cleanEmail)
        .single();

      const formBody = new URLSearchParams();
      formBody.append('_subject', 'PARTNER CONVERSION! ' + (userData?.full_name || cleanEmail));
      formBody.append('Full_Name', userData?.full_name || 'Unknown');
      formBody.append('Email', cleanEmail);
      formBody.append('Brokerage', userData?.brokerage || 'Unknown');
      formBody.append('License_Number', licenseNumber);
      formBody.append('Phone', phone);
      formBody.append('Address', address + ', ' + city + ', ' + state + ' ' + zip);
      formBody.append('Converted_On', readableTime);

      await fetch('https://formspree.io/f/mgoyyney', {
        method: 'POST',
        body: formBody,
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      console.error('Formspree notification failed:', e);
    }

    // ===== STEP 5: Send welcome email to new partner =====
    try {
      await fetch('https://agent-edge-backend.vercel.app/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'welcome',
          to: cleanEmail,
          name: (await supabase.from('users').select('full_name').eq('email', cleanEmail).single()).data?.full_name || 'Partner'
        })
      });
    } catch (e) {
      console.error('Welcome email failed:', e);
    }

    return res.status(200).json({ success: true, message: 'Welcome to the team!' });

  } catch (error) {
    console.error('Conversion error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
