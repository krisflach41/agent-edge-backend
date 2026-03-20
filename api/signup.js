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
    const { fullName, email, brokerage, title, phone, website, password, accountType } = req.body;

    if (!fullName || !email || !brokerage || !password) {
      return res.status(400).json({ success: false, message: 'All required fields must be filled in.' });
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

    // Determine role based on accountType
    const role = (accountType === 'partner') ? 'partner' : 'trial';
    const accountLabel = (role === 'partner') ? 'Partner' : 'Explorer';

    const now = new Date().toISOString();

    // ===== GENERATE AE ID =====
    let aeId = 'AE-10001'; // default first ID
    try {
      const { data: maxRow } = await supabase
        .from('users')
        .select('ae_id')
        .not('ae_id', 'is', null)
        .order('ae_id', { ascending: false })
        .limit(1);

      if (maxRow && maxRow.length > 0 && maxRow[0].ae_id) {
        const lastNum = parseInt(maxRow[0].ae_id.replace('AE-', ''), 10);
        if (!isNaN(lastNum)) {
          aeId = 'AE-' + (lastNum + 1);
        }
      }
    } catch (aeErr) {
      console.error('AE ID generation error:', aeErr);
      // Fall back to timestamp-based ID
      aeId = 'AE-' + Date.now().toString().slice(-5);
    }

    // ===== STEP 1: Find or create CRM contact (dedup) =====
    // Search priority: email > phone > name+company
    let existingCrm = null;
    let crmId = null;

    // 1. Email match
    const { data: byEmail } = await supabase
      .from('crm_contacts')
      .select('*')
      .ilike('email', cleanEmail)
      .limit(1);
    if (byEmail && byEmail.length > 0) existingCrm = byEmail[0];

    // 2. Phone match
    if (!existingCrm && phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        const { data: byPhone } = await supabase
          .from('crm_contacts')
          .select('*')
          .ilike('phone', '%' + cleanPhone)
          .limit(1);
        if (byPhone && byPhone.length > 0) existingCrm = byPhone[0];
      }
    }

    // 3. Name + Company match
    if (!existingCrm && fullName && brokerage) {
      const { data: byNameCo } = await supabase
        .from('crm_contacts')
        .select('*')
        .ilike('name', fullName)
        .ilike('company', '%' + brokerage.replace(/[^a-zA-Z0-9 ]/g, '%') + '%')
        .limit(1);
      if (byNameCo && byNameCo.length > 0) existingCrm = byNameCo[0];
    }

    if (existingCrm) {
      // UPDATE existing CRM card — preserve id and ae_id, upgrade with signup info
      crmId = existingCrm.id;
      aeId = existingCrm.ae_id || aeId; // keep existing ae_id if it has one

      const { error: updateError } = await supabase
        .from('crm_contacts')
        .update({
          email: cleanEmail,
          name: fullName,
          company: brokerage,
          job_title: title || existingCrm.job_title || null,
          phone: phone || existingCrm.phone || null,
          website: website || existingCrm.website || null,
          type: 'realtor',
          root_type: existingCrm.root_type || 'realtor',
          designations: [...new Set([...(existingCrm.designations || []), 'partner'])],
          source: existingCrm.source ? existingCrm.source + ', portal_signup' : 'portal_signup',
          ae_id: aeId,
          updated_at: now
        })
        .eq('id', crmId);

      if (updateError) {
        console.error('CRM contact update failed:', updateError);
      }
    } else {
      // INSERT new CRM card
      crmId = cleanEmail;
      const { error: crmError } = await supabase
        .from('crm_contacts')
        .insert([{
          id: crmId,
          name: fullName,
          email: cleanEmail,
          company: brokerage,
          job_title: title || '',
          phone: phone || '',
          website: website || '',
          type: 'realtor',
          root_type: 'realtor',
          designations: ['partner'],
          source: 'portal_signup',
          ae_id: aeId,
          created_at: now,
          updated_at: now
        }]);

      if (crmError) {
        console.error('CRM contact creation failed:', crmError);
        if (crmError.code !== '23505') {
          return res.status(500).json({ success: false, message: 'Failed to create account. Please try again.' });
        }
      }
    }

    // ===== STEP 2: Create user record =====
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        username: cleanEmail,
        password: hashedPassword,
        email: cleanEmail,
        full_name: fullName,
        brokerage: brokerage,
        title: title || '',
        phone: phone || '',
        website: website || '',
        role: role,
        ae_id: aeId,
        is_admin: false,
        temp_password: false,
        trial_start_date: (role === 'trial') ? now : null,
        joined_date: now
      }])
      .select();

    if (insertError) {
      console.error('User insert error:', insertError);
      return res.status(500).json({ success: false, message: 'Failed to create account' });
    }

    // ===== STEP 3: Track signup activity =====
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: crmId,
          type: 'signup',
          subject: 'New ' + accountLabel + ' Signup',
          body: accountLabel + ' signup — ' + fullName + ' / ' + brokerage + ' [' + aeId + ']',
          date: now
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // ===== STEP 4: SMS notification to Kristy =====
    try {
      const smsMessage = 'Agent Edge: New ' + accountLabel + ' signup!\n' +
        fullName + ' / ' + brokerage + '\n' +
        cleanEmail + '\n' +
        'ID: ' + aeId;

      await fetch('https://agent-edge-backend.vercel.app/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '+12063135883',
          message: smsMessage
        })
      });
    } catch (smsErr) {
      console.error('SMS notification failed:', smsErr);
    }

    return res.status(200).json({
      success: true,
      user: {
        username: cleanEmail,
        name: fullName,
        email: cleanEmail,
        brokerage: brokerage,
        title: title || '',
        phone: phone || '',
        website: website || ''
      },
      role: role,
      aeId: aeId,
      trialStart: (role === 'trial') ? now : null
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
