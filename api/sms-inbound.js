// /api/sms-inbound.js — Telnyx inbound SMS webhook
// Handles STOP/START opt-out compliance and forwards replies to Kristy's phone

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).end();

  try {
    var payload = req.body;
    var eventType = '';
    var msgData = {};

    if (payload && payload.data) {
      eventType = payload.data.event_type || '';
      msgData = payload.data.payload || {};
    }

    if (eventType !== 'message.received') {
      return res.status(200).json({ received: true, skipped: eventType || 'no event_type' });
    }

    var fromNumber = (msgData.from && msgData.from.phone_number) || '';
    var messageText = msgData.text || '';

    if (!fromNumber || !messageText) {
      return res.status(200).json({ received: true, skipped: 'no from or text' });
    }

    var apiKey = process.env.TELNYX_API_KEY;
    var fromNum = process.env.TELNYX_FROM_NUMBER;
    var kristyPhone = '+12063135883';

    if (!apiKey || !fromNum) {
      console.error('sms-inbound: Telnyx not configured');
      return res.status(200).json({ received: true, error: 'Telnyx not configured' });
    }

    // Clean the from number for DB matching (last 10 digits)
    var cleanDigits = fromNumber.replace(/[^0-9]/g, '');
    if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) cleanDigits = cleanDigits.substring(1);
    var last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    // Format for display
    var displayFrom = fromNumber;
    if (last10.length === 10) {
      displayFrom = '(' + last10.substring(0, 3) + ') ' + last10.substring(3, 6) + '-' + last10.substring(6);
    }

    // Check for STOP / UNSUBSCRIBE keywords
    var msgUpper = messageText.trim().toUpperCase();
    var stopWords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'OPT OUT', 'OPTOUT', 'QUIT', 'END'];
    var startWords = ['START', 'SUBSCRIBE', 'OPT IN', 'OPTIN', 'UNSTOP', 'YES'];

    var isStop = stopWords.indexOf(msgUpper) !== -1;
    var isStart = startWords.indexOf(msgUpper) !== -1;

    if (isStop) {
      // Mark contact as SMS unsubscribed in CRM
      try {
        await supabase
          .from('crm_contacts')
          .update({ sms_unsubscribed: true, sms_unsubscribed_at: new Date().toISOString() })
          .ilike('phone', '%' + last10);
      } catch (e) { console.error('STOP CRM update error:', e); }

      // Cancel active drip enrollments for this contact
      try {
        var { data: contacts } = await supabase
          .from('crm_contacts')
          .select('email')
          .ilike('phone', '%' + last10);
        if (contacts && contacts.length > 0) {
          for (var ci = 0; ci < contacts.length; ci++) {
            if (contacts[ci].email) {
              await supabase
                .from('ae_drip_enrollments')
                .update({ status: 'sms_unsubscribed', completed_at: new Date().toISOString() })
                .ilike('contact_email', contacts[ci].email)
                .eq('status', 'active');
            }
          }
        }
      } catch (e) { console.error('STOP enrollment cancel error:', e); }

      // Move webinar registrants to abandoned
      try {
        if (contacts && contacts.length > 0) {
          for (var wi = 0; wi < contacts.length; wi++) {
            if (contacts[wi].email) {
              await supabase
                .from('ae_webinar_registrants')
                .update({ pipeline_stage: 'abandoned' })
                .ilike('email', contacts[wi].email)
                .eq('pipeline_stage', 'registered');
            }
          }
        }
      } catch (e) { console.error('STOP webinar abandon error:', e); }

      // Send confirmation to the person
      await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          from: fromNum, to: fromNumber,
          text: 'You have been unsubscribed from text messages. Reply START to re-subscribe.'
        })
      });

      // Notify Kristy
      await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          from: fromNum, to: kristyPhone,
          text: '\u26a0\ufe0f SMS OPT-OUT\nFrom: ' + displayFrom + '\nThey replied STOP and have been unsubscribed from texts.'
        })
      });

      return res.status(200).json({ received: true, action: 'stop', from: fromNumber });
    }

    if (isStart) {
      // Re-subscribe — remove the SMS opt-out flag
      try {
        await supabase
          .from('crm_contacts')
          .update({ sms_unsubscribed: false, sms_unsubscribed_at: null })
          .ilike('phone', '%' + last10);
      } catch (e) { console.error('START CRM update error:', e); }

      // Send confirmation
      await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          from: fromNum, to: fromNumber,
          text: 'You have been re-subscribed to text messages. Reply STOP at any time to opt out.'
        })
      });

      // Notify Kristy
      await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
          from: fromNum, to: kristyPhone,
          text: '\u2705 SMS OPT-IN\nFrom: ' + displayFrom + '\nThey replied START and are re-subscribed to texts.'
        })
      });

      return res.status(200).json({ received: true, action: 'start', from: fromNumber });
    }

    // Normal reply — forward to Kristy
    var forwardMsg = '\ud83d\udd14 AGENT EDGE REPLY\nFrom: ' + displayFrom + '\n\n' + messageText;

    await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ from: fromNum, to: kristyPhone, text: forwardMsg })
    });

    return res.status(200).json({ received: true, forwarded: true, from: fromNumber });

  } catch (err) {
    console.error('sms-inbound error:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}
