// /api/resend-webhook.js — Receives webhook events from Resend for open/click tracking

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Resend sends POST requests — reject anything else
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var event = req.body;

    // Resend webhook payload structure:
    // { type: 'email.opened', created_at: '...', data: { email_id: '...', ... } }
    // { type: 'email.clicked', created_at: '...', data: { email_id: '...', click: { link: '...' } } }

    var eventType = event.type || '';
    var data = event.data || {};
    var resendId = data.email_id || '';

    if (!resendId) {
      return res.status(200).json({ received: true, skipped: 'no email_id' });
    }

    var now = new Date().toISOString();

    if (eventType === 'email.opened') {
      // Only set opened_at if it hasn't been set yet (first open)
      const { error } = await supabase
        .from('ae_email_log')
        .update({ opened_at: now })
        .eq('resend_id', resendId)
        .is('opened_at', null);

      if (error) console.error('Webhook open update error:', error);

      return res.status(200).json({ received: true, type: 'opened', resend_id: resendId });
    }

    if (eventType === 'email.clicked') {
      var clickUrl = '';
      if (data.click && data.click.link) {
        clickUrl = data.click.link;
      }

      // Update clicked_at (first click only) and always log the URL
      const { data: existing } = await supabase
        .from('ae_email_log')
        .select('clicked_at')
        .eq('resend_id', resendId)
        .maybeSingle();

      var updateFields = {};
      if (!existing || !existing.clicked_at) {
        updateFields.clicked_at = now;
      }
      // Set opened_at too if not already set — a click implies an open
      updateFields.opened_at = now;
      if (clickUrl) {
        updateFields.click_url = clickUrl;
      }

      const { error } = await supabase
        .from('ae_email_log')
        .update(updateFields)
        .eq('resend_id', resendId)
        .is('clicked_at', null);

      // If clicked_at was already set, just update click_url with latest
      if (existing && existing.clicked_at && clickUrl) {
        await supabase
          .from('ae_email_log')
          .update({ click_url: clickUrl })
          .eq('resend_id', resendId);
      }

      if (error) console.error('Webhook click update error:', error);

      return res.status(200).json({ received: true, type: 'clicked', resend_id: resendId });
    }

    // Other event types (delivered, bounced, complained) — log but don't act yet
    if (eventType === 'email.delivered') {
      await supabase
        .from('ae_email_log')
        .update({ status: 'delivered' })
        .eq('resend_id', resendId);

      return res.status(200).json({ received: true, type: 'delivered' });
    }

    if (eventType === 'email.bounced') {
      await supabase
        .from('ae_email_log')
        .update({ status: 'bounced' })
        .eq('resend_id', resendId);

      return res.status(200).json({ received: true, type: 'bounced' });
    }

    if (eventType === 'email.complained') {
      await supabase
        .from('ae_email_log')
        .update({ status: 'complained' })
        .eq('resend_id', resendId);

      return res.status(200).json({ received: true, type: 'complained' });
    }

    // Unknown event type — acknowledge it so Resend doesn't retry
    return res.status(200).json({ received: true, type: eventType, skipped: 'unhandled event type' });

  } catch (err) {
    console.error('Resend webhook error:', err);
    // Always return 200 to Resend so it doesn't keep retrying
    return res.status(200).json({ received: true, error: err.message });
  }
}
