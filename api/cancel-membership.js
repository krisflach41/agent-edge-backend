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
    const { email, reason, feedback } = req.body;

    if (!email || !reason) {
      return res.status(400).json({ success: false, message: 'Please provide a reason' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const now = new Date().toISOString();

    // ===== STEP 1: Set user role to cancelled =====
    const { error: userError } = await supabase
      .from('users')
      .update({
        role: 'cancelled',
        last_login: now
      })
      .eq('email', cleanEmail);

    if (userError) {
      console.error('User cancellation failed:', userError);
      return res.status(500).json({ success: false, message: 'Failed to process cancellation' });
    }

    // ===== STEP 2: Track cancellation with survey data =====
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: cleanEmail,
          type: 'cancellation',
          subject: 'Trial Cancelled',
          body: 'Reason: ' + reason + (feedback ? ' | Feedback: ' + feedback : ''),
          date: now
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // ===== STEP 3: Notify Kristy with survey results =====
    try {
      const readableTime = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Get user name
      const { data: userData } = await supabase
        .from('users')
        .select('full_name, brokerage')
        .eq('email', cleanEmail)
        .single();

      const formBody = new URLSearchParams();
      formBody.append('_subject', 'CANCELLATION: ' + (userData?.full_name || cleanEmail));
      formBody.append('Full_Name', userData?.full_name || 'Unknown');
      formBody.append('Email', cleanEmail);
      formBody.append('Brokerage', userData?.brokerage || 'Unknown');
      formBody.append('Reason', reason);
      formBody.append('Additional_Feedback', feedback || 'None provided');
      formBody.append('Cancelled_On', readableTime);

      await fetch('https://formspree.io/f/mgoyyney', {
        method: 'POST',
        body: formBody,
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      console.error('Formspree notification failed:', e);
    }

    return res.status(200).json({ success: true, message: 'Account cancelled' });

  } catch (error) {
    console.error('Cancellation error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
