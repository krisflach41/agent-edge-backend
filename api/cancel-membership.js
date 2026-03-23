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
      var smsMsg = 'Agent Edge: CANCELLATION\n' +
        (userData?.full_name || 'Unknown') + ' / ' + (userData?.brokerage || '') + '\n' +
        cleanEmail + '\n' +
        'Reason: ' + reason;

      await fetch('https://agent-edge-backend.vercel.app/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: '+12063135883', message: smsMsg })
      });
    } catch (e) {
      console.error('SMS notification failed:', e);
    }

    // ===== STEP 4: Send goodbye email =====
    try {
      await fetch('https://agent-edge-backend.vercel.app/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'goodbye',
          to: cleanEmail,
          name: userData?.full_name || 'Friend'
        })
      });
    } catch (e) {
      console.error('Goodbye email failed:', e);
    }

    return res.status(200).json({ success: true, message: 'Account cancelled' });

  } catch (error) {
    console.error('Cancellation error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
