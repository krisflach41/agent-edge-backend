import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// This endpoint is called daily by Vercel Cron
// It finds trial users whose trial started 6 days ago (expiring tomorrow)
// and sends them a reminder email

export default async function handler(req, res) {
  // Verify this is a cron call (Vercel sends this header)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow manual trigger for testing
    if (req.method !== 'POST' || !req.body?.manual) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Calculate the date 6 days ago (trial started 6 days ago = expires tomorrow)
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    const startOfDay = new Date(sixDaysAgo);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(sixDaysAgo);
    endOfDay.setHours(23, 59, 59, 999);

    // Find trial users whose trial started 6 days ago
    const { data: expiringUsers, error } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('role', 'trial')
      .gte('trial_start_date', startOfDay.toISOString())
      .lte('trial_start_date', endOfDay.toISOString());

    if (error) {
      console.error('Cron query error:', error);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!expiringUsers || expiringUsers.length === 0) {
      console.log('No trials expiring tomorrow');
      return res.status(200).json({ success: true, sent: 0, message: 'No trials expiring tomorrow' });
    }

    // Send reminder emails
    let sent = 0;
    let failed = 0;

    for (const user of expiringUsers) {
      try {
        const emailResponse = await fetch('https://agent-edge-backend.vercel.app/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'trial-ending',
            to: user.email,
            name: user.full_name || 'there'
          })
        });

        if (emailResponse.ok) {
          sent++;
          console.log('Trial reminder sent to:', user.email);

          // Track the reminder in activity
          await supabase
            .from('crm_activity')
            .insert([{
              crm_id: user.email,
              type: 'email_sent',
              subject: 'Trial Ending Reminder',
              body: 'Automated Day 6 trial ending reminder email sent',
              date: new Date().toISOString()
            }]);
        } else {
          failed++;
          console.error('Failed to send to:', user.email);
        }
      } catch (e) {
        failed++;
        console.error('Email send error for:', user.email, e);
      }
    }

    return res.status(200).json({
      success: true,
      sent: sent,
      failed: failed,
      total: expiringUsers.length
    });

  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
