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
    const { userName, userEmail, collection, tool, action, details } = req.body;

    // Log to Supabase activity table
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: userEmail || 'unknown',
          type: (collection || tool || 'activity').toLowerCase().replace(/\s+/g, '_'),
          subject: action || 'Activity',
          body: details ? `${collection || ''} ${tool || ''}: ${details}`.trim() : `${collection || ''} ${tool || ''}`.trim(),
          date: new Date().toISOString()
        }]);
    } catch (activityError) {
      console.error('Supabase activity logging failed:', activityError);
    }

    console.log('Activity Tracked:', { userName, action, collection, tool });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Tracking error:', error);
    return res.status(200).json({ success: false, message: 'Tracking failed silently' });
  }
}
