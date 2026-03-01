import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    var today = new Date();
    var month = String(today.getMonth() + 1).padStart(2, '0');
    var day = String(today.getDate()).padStart(2, '0');
    var mmdd = month + '-' + day; // e.g. "03-15"

    // Get all CRM contacts with birthdays matching today's month-day
    const { data: contacts, error: crmErr } = await supabase
      .from('crm_contacts')
      .select('email, first_name, last_name, lo_user_id, birthday')
      .not('email', 'is', null)
      .not('birthday', 'is', null);

    if (crmErr || !contacts) {
      return res.status(200).json({ success: true, checked: 0, enrolled: 0, message: 'No contacts or error' });
    }

    // Filter to today's birthdays (birthday format: YYYY-MM-DD)
    var birthdayContacts = contacts.filter(function(c) {
      if (!c.birthday || !c.email) return false;
      var parts = c.birthday.split('-');
      if (parts.length >= 3) return parts[1] + '-' + parts[2] === mmdd;
      if (parts.length === 2) return c.birthday === mmdd;
      return false;
    });

    var enrolled = 0;

    for (var i = 0; i < birthdayContacts.length; i++) {
      var contact = birthdayContacts[i];
      var loUserId = contact.lo_user_id || 'default';

      // Find active birthday campaigns
      const { data: campaigns } = await supabase
        .from('ae_drip_campaigns')
        .select('id')
        .eq('trigger_type', 'birthday')
        .eq('status', 'active')
        .or('lo_user_id.eq.' + loUserId + ',lo_user_id.eq.default');

      if (!campaigns || campaigns.length === 0) continue;

      for (var j = 0; j < campaigns.length; j++) {
        // Check not already enrolled this year
        var yearStart = today.getFullYear() + '-01-01T00:00:00Z';
        const { data: existing } = await supabase
          .from('ae_drip_enrollments')
          .select('id')
          .eq('campaign_id', campaigns[j].id)
          .eq('contact_email', contact.email.toLowerCase())
          .gte('enrolled_at', yearStart)
          .maybeSingle();

        if (existing) continue;

        // Get first step
        const { data: firstStep } = await supabase
          .from('ae_drip_steps')
          .select('delay_days')
          .eq('campaign_id', campaigns[j].id)
          .order('step_order', { ascending: true })
          .limit(1)
          .maybeSingle();

        var delayMs = (firstStep?.delay_days || 0) * 86400000;
        var nextSend = new Date(Date.now() + delayMs).toISOString();

        const { error: enrollErr } = await supabase
          .from('ae_drip_enrollments')
          .insert({
            campaign_id: campaigns[j].id,
            lo_user_id: loUserId,
            contact_email: contact.email.toLowerCase(),
            contact_name: ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim(),
            current_step: 0,
            status: 'active',
            next_send_at: nextSend
          });

        if (!enrollErr) enrolled++;
      }
    }

    return res.status(200).json({
      success: true,
      checked: birthdayContacts.length,
      enrolled: enrolled,
      date: mmdd
    });

  } catch (err) {
    console.error('Birthday check error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
