import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var { trigger, contact_email, contact_name, lo_user_id } = req.body;

    if (!trigger || !contact_email) {
      return res.status(400).json({ success: false, message: 'trigger and contact_email required' });
    }

    lo_user_id = lo_user_id || 'default';
    contact_email = contact_email.toLowerCase();

    // Find active campaigns with this trigger for this LO (or default prebuilt ones)
    const { data: campaigns, error: campErr } = await supabase
      .from('ae_drip_campaigns')
      .select('id, name')
      .eq('trigger_type', trigger)
      .eq('status', 'active')
      .or('lo_user_id.eq.' + lo_user_id + ',lo_user_id.eq.default');

    if (campErr || !campaigns || campaigns.length === 0) {
      return res.status(200).json({ success: true, enrolled: 0, message: 'No active campaigns for trigger: ' + trigger });
    }

    var enrolled = 0;

    for (var i = 0; i < campaigns.length; i++) {
      var campaign = campaigns[i];

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('ae_drip_enrollments')
        .select('id')
        .eq('campaign_id', campaign.id)
        .eq('contact_email', contact_email)
        .in('status', ['active', 'completed'])
        .maybeSingle();

      if (existing) continue; // Already in this campaign

      // Get first step delay
      const { data: firstStep } = await supabase
        .from('ae_drip_steps')
        .select('delay_days')
        .eq('campaign_id', campaign.id)
        .order('step_order', { ascending: true })
        .limit(1)
        .maybeSingle();

      var delayMs = (firstStep?.delay_days || 0) * 86400000;
      var nextSend = new Date(Date.now() + delayMs).toISOString();

      const { error: enrollErr } = await supabase
        .from('ae_drip_enrollments')
        .insert({
          campaign_id: campaign.id,
          lo_user_id: lo_user_id,
          contact_email: contact_email,
          contact_name: contact_name || '',
          current_step: 0,
          status: 'active',
          next_send_at: nextSend
        });

      if (!enrollErr) enrolled++;
    }

    return res.status(200).json({ success: true, enrolled: enrolled });

  } catch (err) {
    console.error('Auto-enroll error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
