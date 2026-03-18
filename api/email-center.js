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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var action = req.method === 'GET' ? (req.query.action || '') : (req.body.action || '');
    var loUserId = req.method === 'GET' ? (req.query.lo_user_id || 'default') : (req.body.lo_user_id || 'default');

    // =====================
    // TEMPLATES
    // =====================

    if (action === 'list_templates') {
      const { data, error } = await supabase
        .from('ae_email_templates')
        .select('*')
        .eq('lo_user_id', loUserId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, templates: data || [] });
    }

    if (action === 'save_template') {
      var t = req.body.template;
      if (!t || !t.name || !t.subject || !t.body_html) {
        return res.status(400).json({ success: false, message: 'name, subject, body_html required' });
      }
      var templateData = {
        lo_user_id: loUserId,
        name: t.name,
        subject: t.subject,
        body_html: t.body_html,
        category: t.category || 'custom',
        tags: t.tags || '',
        updated_at: new Date().toISOString()
      };

      if (t.id) {
        const { data, error } = await supabase
          .from('ae_email_templates')
          .update(templateData)
          .eq('id', t.id)
          .select();
        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, template: data?.[0] });
      } else {
        const { data, error } = await supabase
          .from('ae_email_templates')
          .insert(templateData)
          .select();
        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, template: data?.[0] });
      }
    }

    if (action === 'delete_template') {
      var tid = req.body.template_id;
      if (!tid) return res.status(400).json({ success: false, message: 'template_id required' });
      const { error } = await supabase
        .from('ae_email_templates')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // =====================
    // CAMPAIGNS
    // =====================

    if (action === 'list_campaigns') {
      const { data: campaigns, error } = await supabase
        .from('ae_drip_campaigns')
        .select('*')
        .eq('lo_user_id', loUserId)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Get steps for each campaign
      var campIds = (campaigns || []).map(function(c) { return c.id; });
      var allSteps = [];
      if (campIds.length > 0) {
        const { data: steps } = await supabase
          .from('ae_drip_steps')
          .select('*')
          .in('campaign_id', campIds)
          .order('step_order', { ascending: true });
        allSteps = steps || [];
      }

      // Get enrollment counts
      var enriched = (campaigns || []).map(function(c) {
        c.steps = allSteps.filter(function(s) { return s.campaign_id === c.id; });
        return c;
      });

      return res.status(200).json({ success: true, campaigns: enriched });
    }

    if (action === 'get_campaign') {
      var cid = req.query?.campaign_id || req.body?.campaign_id;
      if (!cid) return res.status(400).json({ success: false, message: 'campaign_id required' });

      const { data: campaign, error } = await supabase
        .from('ae_drip_campaigns')
        .select('*')
        .eq('id', cid)
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });

      const { data: steps } = await supabase
        .from('ae_drip_steps')
        .select('*')
        .eq('campaign_id', cid)
        .order('step_order', { ascending: true });

      const { data: enrollments } = await supabase
        .from('ae_drip_enrollments')
        .select('*')
        .eq('campaign_id', cid)
        .order('enrolled_at', { ascending: false });

      campaign.steps = steps || [];
      campaign.enrollments = enrollments || [];
      return res.status(200).json({ success: true, campaign: campaign });
    }

    if (action === 'save_campaign') {
      var c = req.body.campaign;
      if (!c || !c.name) return res.status(400).json({ success: false, message: 'campaign name required' });

      var campData = {
        lo_user_id: loUserId,
        name: c.name,
        description: c.description || '',
        trigger_type: c.trigger_type || 'manual',
        status: c.status || 'draft',
        updated_at: new Date().toISOString()
      };

      var campId;
      if (c.id) {
        const { data, error } = await supabase
          .from('ae_drip_campaigns')
          .update(campData)
          .eq('id', c.id)
          .select();
        if (error) return res.status(500).json({ success: false, message: error.message });
        campId = c.id;
      } else {
        const { data, error } = await supabase
          .from('ae_drip_campaigns')
          .insert(campData)
          .select();
        if (error) return res.status(500).json({ success: false, message: error.message });
        campId = data?.[0]?.id;
      }

      // Save steps (delete old, insert new)
      if (c.steps && Array.isArray(c.steps)) {
        await supabase.from('ae_drip_steps').delete().eq('campaign_id', campId);
        var stepRows = c.steps.map(function(s, i) {
          return {
            campaign_id: campId,
            step_order: i + 1,
            step_type: s.step_type || 'email',
            delay_days: s.delay_days || 0,
            template_id: s.template_id || null,
            subject_override: s.subject_override || '',
            body_override: s.body_override || '',
            sms_body: s.sms_body || ''
          };
        });
        if (stepRows.length > 0) {
          const { error: stepErr } = await supabase.from('ae_drip_steps').insert(stepRows);
          if (stepErr) console.error('Step save error:', stepErr);
        }
      }

      return res.status(200).json({ success: true, campaign_id: campId });
    }

    if (action === 'delete_campaign') {
      var dcid = req.body.campaign_id;
      if (!dcid) return res.status(400).json({ success: false, message: 'campaign_id required' });
      // Cascade deletes steps and enrollments
      const { error } = await supabase.from('ae_drip_campaigns').delete().eq('id', dcid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'toggle_campaign') {
      var tcid = req.body.campaign_id;
      var newStatus = req.body.status; // 'active' or 'paused'
      if (!tcid || !newStatus) return res.status(400).json({ success: false, message: 'campaign_id and status required' });
      const { error } = await supabase
        .from('ae_drip_campaigns')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', tcid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // =====================
    // ENROLLMENTS
    // =====================

    if (action === 'enroll') {
      var e = req.body;
      if (!e.campaign_id || !e.contact_email) {
        return res.status(400).json({ success: false, message: 'campaign_id and contact_email required' });
      }

      // Check not already enrolled
      const { data: existing } = await supabase
        .from('ae_drip_enrollments')
        .select('id')
        .eq('campaign_id', e.campaign_id)
        .eq('contact_email', e.contact_email.toLowerCase())
        .eq('status', 'active')
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ success: true, message: 'Already enrolled', enrollment_id: existing.id });
      }

      // Get first step to calculate next_send_at
      const { data: firstStep } = await supabase
        .from('ae_drip_steps')
        .select('delay_days')
        .eq('campaign_id', e.campaign_id)
        .order('step_order', { ascending: true })
        .limit(1)
        .maybeSingle();

      var delayMs = (firstStep?.delay_days || 0) * 86400000;
      var nextSend = new Date(Date.now() + delayMs).toISOString();

      const { data: enrollment, error } = await supabase
        .from('ae_drip_enrollments')
        .insert({
          campaign_id: e.campaign_id,
          lo_user_id: loUserId,
          contact_email: e.contact_email.toLowerCase(),
          contact_name: e.contact_name || '',
          current_step: 0,
          status: 'active',
          next_send_at: nextSend
        })
        .select();

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, enrollment: enrollment?.[0] });
    }

    if (action === 'unenroll') {
      var uid = req.body.enrollment_id;
      if (!uid) return res.status(400).json({ success: false, message: 'enrollment_id required' });
      const { error } = await supabase
        .from('ae_drip_enrollments')
        .update({ status: 'paused' })
        .eq('id', uid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'upcoming_sends') {
      var sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('ae_drip_enrollments')
        .select('*, ae_drip_campaigns(name)')
        .eq('lo_user_id', loUserId)
        .eq('status', 'active')
        .not('next_send_at', 'is', null)
        .lte('next_send_at', sevenDays)
        .order('next_send_at', { ascending: true })
        .limit(10);
      if (error) return res.status(500).json({ success: false, message: error.message });
      var upcoming = (data || []).map(function(e) {
        return {
          contact_email: e.contact_email,
          contact_name: e.contact_name,
          current_step: e.current_step,
          next_send_at: e.next_send_at,
          campaign_name: e.ae_drip_campaigns ? e.ae_drip_campaigns.name : ''
        };
      });
      return res.status(200).json({ success: true, upcoming: upcoming });
    }

    if (action === 'total_enrolled') {
      const { count, error } = await supabase
        .from('ae_drip_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('lo_user_id', loUserId)
        .eq('status', 'active');
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, total: count || 0 });
    }

    if (action === 'resume_enrollment') {
      var rid = req.body.enrollment_id;
      if (!rid) return res.status(400).json({ success: false, message: 'enrollment_id required' });
      var nextSendAt = new Date(Date.now() + 86400000).toISOString();
      const { error } = await supabase
        .from('ae_drip_enrollments')
        .update({ status: 'active', next_send_at: nextSendAt })
        .eq('id', rid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    if (action === 'remove_enrollment') {
      var rmid = req.body.enrollment_id;
      if (!rmid) return res.status(400).json({ success: false, message: 'enrollment_id required' });
      const { error } = await supabase
        .from('ae_drip_enrollments')
        .delete()
        .eq('id', rmid);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // =====================
    // EMAIL LOG / STATS
    // =====================

    if (action === 'email_stats') {
      var now = new Date();
      var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: logs, error } = await supabase
        .from('ae_email_log')
        .select('status, opened_at, clicked_at')
        .eq('lo_user_id', loUserId)
        .gte('sent_at', monthStart);

      if (error) return res.status(500).json({ success: false, message: error.message });

      var total = (logs || []).length;
      var delivered = (logs || []).filter(function(l) { return l.status === 'delivered' || l.status === 'sent'; }).length;
      var opened = (logs || []).filter(function(l) { return l.opened_at; }).length;
      var clicked = (logs || []).filter(function(l) { return l.clicked_at; }).length;
      var bounced = (logs || []).filter(function(l) { return l.status === 'bounced'; }).length;
      var openRate = delivered > 0 ? Math.round((opened / delivered) * 100) : 0;
      var clickRate = delivered > 0 ? Math.round((clicked / delivered) * 100) : 0;

      return res.status(200).json({
        success: true,
        stats: { sent_this_month: total, delivered: delivered, open_rate: openRate, click_rate: clickRate, opened: opened, clicked: clicked, bounced: bounced }
      });
    }

    if (action === 'campaign_stats') {
      var campId = req.query?.campaign_id || req.body?.campaign_id;
      if (!campId) return res.status(400).json({ success: false, message: 'campaign_id required' });

      const { data: logs, error } = await supabase
        .from('ae_email_log')
        .select('status, opened_at, clicked_at, to_email, subject, sent_at, step_order')
        .eq('campaign_id', parseInt(campId));

      if (error) return res.status(500).json({ success: false, message: error.message });

      var entries = logs || [];
      var total = entries.length;
      var delivered = entries.filter(function(l) { return l.status === 'delivered' || l.status === 'sent'; }).length;
      var opened = entries.filter(function(l) { return l.opened_at; }).length;
      var clicked = entries.filter(function(l) { return l.clicked_at; }).length;
      var bounced = entries.filter(function(l) { return l.status === 'bounced'; }).length;
      var complained = entries.filter(function(l) { return l.status === 'complained'; }).length;

      // Check how many unique emails have unsubscribed
      var uniqueEmails = [];
      entries.forEach(function(l) { if (l.to_email && uniqueEmails.indexOf(l.to_email.toLowerCase()) < 0) uniqueEmails.push(l.to_email.toLowerCase()); });
      var unsubscribed = 0;
      if (uniqueEmails.length > 0) {
        const { data: unsubs } = await supabase
          .from('crm_contacts')
          .select('email')
          .eq('unsubscribed', true)
          .in('email', uniqueEmails);
        unsubscribed = (unsubs || []).length;
      }

      var openRate = delivered > 0 ? Math.round((opened / delivered) * 100) : 0;
      var clickRate = delivered > 0 ? Math.round((clicked / delivered) * 100) : 0;
      var bounceRate = total > 0 ? Math.round((bounced / total) * 100) : 0;

      // Per-step breakdown
      var stepMap = {};
      entries.forEach(function(l) {
        var step = l.step_order || 0;
        if (!stepMap[step]) stepMap[step] = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
        stepMap[step].sent++;
        if (l.status === 'delivered' || l.status === 'sent') stepMap[step].delivered++;
        if (l.opened_at) stepMap[step].opened++;
        if (l.clicked_at) stepMap[step].clicked++;
        if (l.status === 'bounced') stepMap[step].bounced++;
      });

      return res.status(200).json({
        success: true,
        stats: {
          total: total, delivered: delivered, opened: opened, clicked: clicked,
          bounced: bounced, complained: complained, unsubscribed: unsubscribed,
          open_rate: openRate, click_rate: clickRate, bounce_rate: bounceRate,
          per_step: stepMap
        }
      });
    }

    if (action === 'email_history') {
      var limit = parseInt(req.query?.limit || req.body?.limit || '50');
      const { data, error } = await supabase
        .from('ae_email_log')
        .select('*')
        .eq('lo_user_id', loUserId)
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, emails: data || [] });
    }

    // =====================
    // SEND ONE-OFF EMAIL
    // =====================

    if (action === 'send_now') {
      var s = req.body;
      if (!s.to || !s.subject || !s.body_html) {
        return res.status(400).json({ success: false, message: 'to, subject, body_html required' });
      }

      // Parse recipients — could be comma-separated string or array
      var recipients = [];
      if (Array.isArray(s.to)) {
        recipients = s.to;
      } else {
        recipients = s.to.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e; });
      }

      // Single recipient — simple send, no campaign
      if (recipients.length === 1) {
        var result = await sendEmail(loUserId, recipients[0], s.to_name || '', s.subject, s.body_html, s.template_id || null, null, null, null);
        return res.status(result.success ? 200 : 500).json(result);
      }

      // Multiple recipients — create a campaign record so it shows in analytics
      var now = new Date().toISOString();
      const { data: camp, error: campErr } = await supabase
        .from('ae_drip_campaigns')
        .insert({
          lo_user_id: loUserId,
          name: s.subject,
          description: 'Bulk send to ' + recipients.length + ' contacts',
          trigger_type: 'manual',
          status: 'completed',
          created_at: now,
          updated_at: now
        })
        .select('id')
        .single();

      if (campErr) {
        return res.status(500).json({ success: false, message: 'Failed to create campaign: ' + campErr.message });
      }

      var campaignId = camp.id;
      var sent = 0;
      var failed = 0;

      for (var i = 0; i < recipients.length; i++) {
        var email = recipients[i];
        var sendResult = await sendEmail(loUserId, email, '', s.subject, s.body_html, s.template_id || null, campaignId, null, 1);
        if (sendResult.success) { sent++; } else { failed++; }
      }

      return res.status(200).json({ success: true, campaign_id: campaignId, sent: sent, failed: failed, total: recipients.length });
    }

    // =====================
    // PROCESS DRIPS (called by cron)
    // =====================

    if (action === 'process_drips') {
      return await processDrips(res);
    }

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('Email Center error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===== SEND EMAIL VIA RESEND =====
async function sendEmail(loUserId, toEmail, toName, subject, bodyHtml, templateId, campaignId, enrollmentId, stepOrder) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { success: false, message: 'Resend API key not configured' };

  // Check if contact has unsubscribed
  try {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('unsubscribed')
      .eq('email', toEmail)
      .maybeSingle();
    if (contact && contact.unsubscribed) {
      return { success: false, message: 'Contact has unsubscribed', unsubscribed: true };
    }
  } catch (e) { /* If lookup fails, proceed with send */ }

  // TODO: For multi-tenant, look up LO's from address and signature from their profile
  // For now, use Kristy's config
  var fromAddress = 'Kristy Flach <kflach@kristyflach.com>';
  var replyTo = 'KFlach@prmg.net';

  // Build full HTML with wrapper
  var fullHtml = buildEmailWrapper(bodyHtml, toEmail);

  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: replyTo,
        to: [toEmail],
        subject: subject,
        html: fullHtml
      })
    });

    var data = await response.json();

    // Log it
    try {
      await supabase.from('ae_email_log').insert({
        lo_user_id: loUserId,
        to_email: toEmail,
        to_name: toName,
        subject: subject,
        template_id: templateId,
        campaign_id: campaignId,
        enrollment_id: enrollmentId,
        step_order: stepOrder,
        resend_id: data.id || '',
        status: response.ok ? 'sent' : 'failed'
      });
    } catch (logErr) {
      console.error('Email log error:', logErr);
    }

    if (!response.ok) {
      return { success: false, message: data.message || 'Send failed' };
    }
    return { success: true, resend_id: data.id };

  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ===== PROCESS DRIP CAMPAIGNS =====
async function processDrips(res) {
  try {
    var now = new Date().toISOString();

    // Get all enrollments that are due
    const { data: due, error } = await supabase
      .from('ae_drip_enrollments')
      .select('*, ae_drip_campaigns(status, lo_user_id)')
      .eq('status', 'active')
      .lte('next_send_at', now);

    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!due || due.length === 0) return res.status(200).json({ success: true, processed: 0 });

    var sent = 0;

    for (var i = 0; i < due.length; i++) {
      var enrollment = due[i];

      // Skip if campaign is paused
      if (enrollment.ae_drip_campaigns?.status !== 'active') continue;

      var nextStepOrder = enrollment.current_step + 1;
      var loUserId = enrollment.ae_drip_campaigns?.lo_user_id || enrollment.lo_user_id;

      // Get the next step
      const { data: step } = await supabase
        .from('ae_drip_steps')
        .select('*, ae_email_templates(subject, body_html)')
        .eq('campaign_id', enrollment.campaign_id)
        .eq('step_order', nextStepOrder)
        .maybeSingle();

      if (!step) {
        // No more steps — mark complete
        await supabase.from('ae_drip_enrollments')
          .update({ status: 'completed', completed_at: now })
          .eq('id', enrollment.id);
        continue;
      }

      // Get subject and body (override or template)
      var stepType = step.step_type || 'email';
      var result;

      if (stepType === 'sms') {
        // SMS step — send via Telnyx
        var smsText = step.sms_body || '';
        if (!smsText) continue;

        // Personalize
        smsText = personalize(smsText, enrollment.contact_name, enrollment.contact_email);

        // Look up contact phone and SMS opt-out status from CRM
        var contactPhone = enrollment.contact_phone || '';
        var smsOptedOut = false;
        if (!contactPhone) {
          const { data: contact } = await supabase
            .from('crm_contacts')
            .select('phone, sms_unsubscribed')
            .ilike('email', enrollment.contact_email)
            .maybeSingle();
          if (contact) {
            if (contact.phone) contactPhone = contact.phone;
            if (contact.sms_unsubscribed) smsOptedOut = true;
          }
        } else {
          // Have phone but still check opt-out
          const { data: contact } = await supabase
            .from('crm_contacts')
            .select('sms_unsubscribed')
            .ilike('email', enrollment.contact_email)
            .maybeSingle();
          if (contact && contact.sms_unsubscribed) smsOptedOut = true;
        }

        if (smsOptedOut) {
          // Contact opted out of SMS — skip this step but advance
          result = { success: true, skipped: 'sms_unsubscribed' };
        } else if (!contactPhone) {
          // No phone number — skip this step but advance
          result = { success: true, skipped: 'no_phone' };
        } else {
          // Send SMS via Telnyx
          try {
            var telnyxKey = process.env.TELNYX_API_KEY;
            var telnyxFrom = process.env.TELNYX_FROM_NUMBER;
            var cleanTo = contactPhone.replace(/[^0-9+]/g, '');
            if (!cleanTo.startsWith('+')) {
              if (cleanTo.startsWith('1') && cleanTo.length === 11) cleanTo = '+' + cleanTo;
              else if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
            }

            var smsResp = await fetch('https://api.telnyx.com/v2/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + telnyxKey },
              body: JSON.stringify({ from: telnyxFrom, to: cleanTo, text: smsText })
            });
            var smsData = await smsResp.json();

            // Log to email_log so analytics track it
            try {
              await supabase.from('ae_email_log').insert({
                lo_user_id: loUserId,
                to_email: enrollment.contact_email,
                to_name: enrollment.contact_name,
                subject: 'SMS: ' + smsText.substring(0, 50),
                campaign_id: enrollment.campaign_id,
                enrollment_id: enrollment.id,
                step_order: nextStepOrder,
                resend_id: smsData.data?.id || '',
                status: smsResp.ok ? 'sent' : 'failed'
              });
            } catch (logErr) { console.error('SMS log error:', logErr); }

            result = { success: smsResp.ok };
          } catch (smsErr) {
            console.error('SMS send error:', smsErr);
            result = { success: false };
          }
        }
      } else {
        // Email step
        var subject = step.subject_override || step.ae_email_templates?.subject || 'Message from your Loan Officer';
        var bodyHtml = step.body_override || step.ae_email_templates?.body_html || '';

        if (!bodyHtml) continue;

        // Personalize
        subject = personalize(subject, enrollment.contact_name, enrollment.contact_email);
        bodyHtml = personalize(bodyHtml, enrollment.contact_name, enrollment.contact_email);

        // Send
        result = await sendEmail(
          loUserId,
          enrollment.contact_email,
          enrollment.contact_name,
          subject,
          bodyHtml,
          step.template_id,
          enrollment.campaign_id,
          enrollment.id,
          nextStepOrder
        );
      }

      if (result.success) {
        // Get next step to calculate next_send_at
        const { data: nextStep } = await supabase
          .from('ae_drip_steps')
          .select('delay_days')
          .eq('campaign_id', enrollment.campaign_id)
          .eq('step_order', nextStepOrder + 1)
          .maybeSingle();

        var nextSendAt = null;
        if (nextStep) {
          nextSendAt = new Date(Date.now() + (nextStep.delay_days || 1) * 86400000).toISOString();
        }

        await supabase.from('ae_drip_enrollments')
          .update({
            current_step: nextStepOrder,
            last_sent_at: now,
            next_send_at: nextSendAt,
            status: nextStep ? 'active' : 'completed',
            completed_at: nextStep ? null : now
          })
          .eq('id', enrollment.id);

        sent++;
      }
    }

    return res.status(200).json({ success: true, processed: due.length, sent: sent });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===== PERSONALIZATION =====
function personalize(text, name, email) {
  var firstName = (name || '').split(' ')[0] || 'there';
  return text
    .replace(/\{\{name\}\}/g, name || 'there')
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{email\}\}/g, email || '');
}

// ===== EMAIL WRAPPER =====
function buildEmailWrapper(bodyHtml, toEmail) {
  var unsubUrl = 'https://agent-edge-backend.vercel.app/api/unsubscribe?email=' + encodeURIComponent(toEmail || '');
  var baseUrl = 'https://kristyflach.com';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="font-family: Arial, Helvetica, sans-serif; color: #333333; margin: 0; padding: 20px; background-color: #f9f9f9;">' +
    '<table cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 4px;">' +
    '<tr><td>' +

    // Email body
    '<div style="font-size: 14px; line-height: 1.6; color: #333333; padding-bottom: 24px; border-bottom: 1px solid #eeeeee; margin-bottom: 20px;">' +
    bodyHtml +
    '</div>' +

    // Signature block
    '<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 20px;"><tr>' +
    '<td style="vertical-align: top; padding-right: 16px;">' +
    '<img src="' + baseUrl + '/hero-headshot.jpg" alt="Kristy Flach" width="80" height="80" style="border-radius: 50%; display: block;" />' +
    '</td>' +
    '<td style="vertical-align: top; font-size: 13px; line-height: 1.5; color: #333333;">' +
    '<div style="font-weight: bold; font-size: 14px; color: #002556;">Kristy Flach</div>' +
    '<div style="color: #555555;">Certified Mortgage Advisor &amp; Loan Officer</div>' +
    '<div style="color: #888888; font-size: 12px;">NMLS ID# 2632259</div>' +
    '<div style="margin-top: 6px;">' +
    '<a href="tel:+12063135883" style="color: #002556; text-decoration: none;">(206) 313-5883</a>' +
    '</div>' +
    '<div>' +
    '<a href="mailto:kflach@prmg.net" style="color: #002556; text-decoration: none;">kflach@prmg.net</a>' +
    '</div>' +
    '<div style="margin-top: 4px;">' +
    '<a href="https://kflach.myprmg.net" style="color: #002556; text-decoration: none; font-size: 12px;">kflach.myprmg.net</a>' +
    ' &nbsp;|&nbsp; ' +
    '<a href="https://kristyflach.com" style="color: #002556; text-decoration: none; font-size: 12px;">kristyflach.com</a>' +
    '</div>' +
    '</td>' +
    '</tr></table>' +

    // PRMG logo and Equal Housing
    '<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;"><tr>' +
    '<td style="vertical-align: middle; padding-right: 12px;">' +
    '<img src="' + baseUrl + '/PRMG-Logo.png" alt="PRMG" height="28" style="display: block;" />' +
    '</td>' +
    '<td style="vertical-align: middle;">' +
    '<img src="' + baseUrl + '/equal-housing-logo.png" alt="Equal Housing Opportunity" height="24" style="display: block;" />' +
    '</td>' +
    '</tr></table>' +

    // Security notice
    '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="border-left: 3px solid #dddddd; padding: 8px 12px; font-size: 11px; line-height: 16px; color: #888888;">' +
    'This message was sent from a marketing platform. For your security, please do not include personal financial information (SSN, account numbers, tax documents) in replies.' +
    '</td></tr></table>' +

    // Unsubscribe
    '<div style="margin-top: 16px; font-size: 11px; color: #999999; text-align: center;">' +
    '<a href="' + unsubUrl + '" style="color: #999999;">Unsubscribe</a>' +
    '</div>' +

    '</td></tr></table></body></html>';
}
