// /api/webinar-reminders.js — Cron endpoint for webinar reminder automation
// Call via Vercel Cron every 5 minutes, or manually trigger
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    var action = (req.body && req.body.action) || req.query.action || 'check_reminders';

    // ===== SEND CONFIRMATION (called immediately on registration) =====
    if (action === 'send_confirmation') {
      var r = req.body;
      if (!r.webinar_id || !r.email) return res.status(400).json({ success: false, message: 'webinar_id and email required' });

      var w = await getWebinar(r.webinar_id);
      if (!w) return res.status(404).json({ success: false, message: 'Webinar not found' });

      var firstName = r.first_name || 'there';
      var prettyDate = w.pretty_date || w.webinar_date || 'TBD';

      // Send confirmation email
      await sendEmail(
        r.email,
        'You\'re registered for ' + w.title + '!',
        '<p>Hi ' + firstName + ',</p>' +
        '<p>You\'re registered for <strong>' + w.title + '</strong>!</p>' +
        '<p>The webinar is on <strong>' + prettyDate + ' EST</strong>.</p>' +
        '<p>We\'ll send you the link to join before it starts.</p>' +
        '<p>Congratulations on taking the first step! We look forward to seeing you there.</p>' +
        '<p>— Kristy Flach<br>Certified Mortgage Advisor & Loan Officer<br>NMLS #2632259</p>'
      );

      // Send confirmation text
      if (r.phone) {
        await sendSMS(
          r.phone,
          'Hi ' + firstName + ', you\'re registered for the ' + w.title + ' on ' + prettyDate + ' EST! We\'ll text you the link before it starts. Reply STOP to opt out.'
        );
      }

      // Mark confirmation sent
      await supabase
        .from('ae_webinar_registrants')
        .update({ confirmation_sent: true })
        .eq('webinar_id', r.webinar_id)
        .ilike('email', r.email);

      return res.status(200).json({ success: true, sent: 'confirmation' });
    }

    // ===== CHECK REMINDERS (cron job) =====
    if (action === 'check_reminders') {
      var now = new Date();
      var results = { day_before: 0, one_hour: 0, thirty_min: 0, five_after: 0, no_show: 0 };

      // Get all published webinars
      const { data: webinars } = await supabase
        .from('ae_webinars')
        .select('*')
        .eq('status', 'published');

      if (!webinars || webinars.length === 0) {
        return res.status(200).json({ success: true, message: 'No webinars to process', results: results });
      }

      for (var wi = 0; wi < webinars.length; wi++) {
        var w = webinars[wi];
        if (!w.formatted_datetime) continue;

        // Build timezone-aware datetime
        var tzOffsets = {
          'America/New_York': { standard: '-05:00', dst: '-04:00' },
          'America/Chicago': { standard: '-06:00', dst: '-05:00' },
          'America/Denver': { standard: '-07:00', dst: '-06:00' },
          'America/Los_Angeles': { standard: '-08:00', dst: '-07:00' },
          'America/Phoenix': { standard: '-07:00', dst: '-07:00' }
        };
        var tz = w.timezone || 'America/New_York';
        var tzInfo = tzOffsets[tz] || tzOffsets['America/New_York'];
        // Check if date is in DST (March second Sunday to November first Sunday)
        var testDate = new Date(w.formatted_datetime + 'Z');
        var month = testDate.getUTCMonth(); // 0-11
        var isDST = month >= 2 && month <= 10; // rough DST check Mar-Nov
        var offset = isDST ? tzInfo.dst : tzInfo.standard;
        var webinarTime = new Date(w.formatted_datetime + offset);
        var diffMs = webinarTime.getTime() - now.getTime();
        var diffHours = diffMs / (1000 * 60 * 60);
        var diffMins = diffMs / (1000 * 60);

        // Get registrants for this webinar who haven't unsubscribed
        const { data: registrants } = await supabase
          .from('ae_webinar_registrants')
          .select('*')
          .eq('webinar_id', w.id)
          .neq('pipeline_stage', 'abandoned');

        if (!registrants || registrants.length === 0) continue;

        var joinLink = 'https://kristyflach.com/landing/' + w.slug + '/join';
        var prettyDate = w.pretty_date || w.webinar_date || '';

        // DAY BEFORE: 23-25 hours before
        if (diffHours >= 23 && diffHours <= 25) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.reminder_day_before) continue;
            var fn = reg.first_name || 'there';

            await sendEmail(
              reg.email,
              'Reminder: ' + w.title + ' is tomorrow!',
              '<p>Hi ' + fn + ',</p>' +
              '<p>Just a reminder — <strong>' + w.title + '</strong> is tomorrow at <strong>' + prettyDate + ' EST</strong>.</p>' +
              '<p>We\'ll send your join link 30 minutes before it starts.</p>' +
              '<p>See you there!</p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, 'Reminder: ' + w.title + ' is tomorrow at ' + prettyDate + ' EST! Watch for your join link tomorrow.');
            }

            await supabase.from('ae_webinar_registrants').update({ reminder_day_before: true }).eq('id', reg.id);
            results.day_before++;
          }
        }

        // 1 HOUR BEFORE: 55-65 minutes before
        if (diffMins >= 55 && diffMins <= 65) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.reminder_one_hour) continue;
            var fn = reg.first_name || 'there';

            await sendEmail(
              reg.email,
              w.title + ' starts in 1 hour!',
              '<p>Hi ' + fn + ',</p>' +
              '<p><strong>' + w.title + '</strong> starts in 1 hour!</p>' +
              '<p>We\'ll send you the join link 30 minutes before it starts.</p>' +
              '<p>See you soon!</p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, w.title + ' starts in 1 hour! We\'ll send your join link 30 minutes before.');
            }

            await supabase.from('ae_webinar_registrants').update({ reminder_one_hour: true }).eq('id', reg.id);
            results.one_hour++;
          }
        }

        // 30 MIN BEFORE: 25-35 minutes before (with the join link)
        if (diffMins >= 25 && diffMins <= 35) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.reminder_thirty_min) continue;
            var fn = reg.first_name || 'there';
            var personalLink = joinLink + '?email=' + encodeURIComponent(reg.email);

            await sendEmail(
              reg.email,
              'Your webinar starts in 30 minutes — join now!',
              '<p>Hi ' + fn + ',</p>' +
              '<p><strong>' + w.title + '</strong> starts in 30 minutes!</p>' +
              '<p><a href="' + personalLink + '" style="display:inline-block;padding:14px 30px;background:#6e7f77;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Click Here to Join</a></p>' +
              '<p>See you inside!</p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, 'Your webinar starts in 30 min! Join here: ' + personalLink);
            }

            await supabase.from('ae_webinar_registrants').update({ reminder_thirty_min: true }).eq('id', reg.id);
            results.thirty_min++;
          }
        }

        // 5 MIN BEFORE START: 3-7 minutes before
        if (diffMins >= 3 && diffMins <= 7) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.reminder_five_before) continue;
            var fn = reg.first_name || 'there';
            var personalLink = joinLink + '?email=' + encodeURIComponent(reg.email);

            await sendEmail(
              reg.email,
              w.title + ' starts in 5 minutes!',
              '<p>Hi ' + fn + ',</p>' +
              '<p><strong>' + w.title + '</strong> starts in 5 minutes!</p>' +
              '<p><a href="' + personalLink + '" style="display:inline-block;padding:14px 30px;background:#6e7f77;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Join Now</a></p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, w.title + ' starts in 5 minutes! Join now: ' + personalLink);
            }

            await supabase.from('ae_webinar_registrants').update({ reminder_five_before: true }).eq('id', reg.id);
          }
        }

        // 5 MIN AFTER START: -5 to -10 minutes (already started) — only if they haven't joined
        if (diffMins >= -10 && diffMins <= -5) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.reminder_five_after || reg.attended) continue;
            var fn = reg.first_name || 'there';
            var personalLink = joinLink + '?email=' + encodeURIComponent(reg.email);

            await sendEmail(
              reg.email,
              'It\'s started — but it\'s not too late to join!',
              '<p>Hi ' + fn + ',</p>' +
              '<p><strong>' + w.title + '</strong> has started, but it\'s not too late!</p>' +
              '<p><a href="' + personalLink + '" style="display:inline-block;padding:14px 30px;background:#6e7f77;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Join Now</a></p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, 'The webinar has started but it\'s not too late! Join now: ' + personalLink);
            }

            await supabase.from('ae_webinar_registrants').update({ reminder_five_after: true }).eq('id', reg.id);
            results.five_after++;
          }
        }

        // NO-SHOW: 3+ hours after start
        if (diffHours <= -3) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.pipeline_stage !== 'registered') continue;
            var fn = reg.first_name || 'there';
            var replayLink = 'https://kristyflach.com/landing/' + w.slug + '/replay';

            await sendEmail(
              reg.email,
              'Sorry we missed you — watch the replay!',
              '<p>Hi ' + fn + ',</p>' +
              '<p>We missed you at <strong>' + w.title + '</strong>!</p>' +
              '<p>The good news is you can still watch the replay:</p>' +
              '<p><a href="' + replayLink + '" style="display:inline-block;padding:14px 30px;background:#6e7f77;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Watch the Replay</a></p>' +
              '<p>— Kristy Flach</p>'
            );

            if (reg.phone && !reg.sms_unsubscribed) {
              await sendSMS(reg.phone, 'We missed you at the webinar! Watch the replay: ' + replayLink);
            }

            await supabase.from('ae_webinar_registrants')
              .update({ pipeline_stage: 'did_not_attend' })
              .eq('id', reg.id);

            // Auto-enroll in matching drip campaign
            await autoEnrollWebinarCampaign('webinar_did_not_attend', reg, w);

            results.no_show++;
          }
        }

        // ATTENDED BUT DIDN'T BOOK: 48+ hours after start
        if (diffHours <= -48) {
          for (var ri = 0; ri < registrants.length; ri++) {
            var reg = registrants[ri];
            if (reg.pipeline_stage !== 'attended') continue;
            if (reg.booked) continue;

            await supabase.from('ae_webinar_registrants')
              .update({ pipeline_stage: 'attended_no_book' })
              .eq('id', reg.id);

            // Auto-enroll in matching drip campaign
            await autoEnrollWebinarCampaign('webinar_attended_no_book', reg, w);

            // Also update CRM card tags if linked
            if (reg.crm_id) {
              try {
                await supabase.from('crm_contacts')
                  .update({ tags: 'webinar:attended_no_book', updated_at: new Date().toISOString() })
                  .eq('id', reg.crm_id);
              } catch (e) {}
            }
          }
        }
      }

      // ===== BOOKING REMINDERS: 10 min before =====
      try {
        var nowMs = now.getTime();
        var tenMinFromNow = new Date(nowMs + 10 * 60 * 1000);
        var fifteenMinFromNow = new Date(nowMs + 15 * 60 * 1000);
        var bkDateStr = tenMinFromNow.toISOString().split('T')[0];

        const { data: upcomingBookings } = await supabase
          .from('ae_bookings')
          .select('*')
          .eq('status', 'confirmed')
          .eq('booking_date', bkDateStr)
          .eq('reminder_10min_sent', false);

        if (upcomingBookings && upcomingBookings.length > 0) {
          for (var bi = 0; bi < upcomingBookings.length; bi++) {
            var bk = upcomingBookings[bi];
            // Parse booking time into a Date for comparison
            var bkParts = bk.booking_time.split(':');
            var bkDateTime = new Date(bkDateStr + 'T00:00:00');
            bkDateTime.setHours(parseInt(bkParts[0]), parseInt(bkParts[1]), 0, 0);

            // Check if booking is 8-12 min from now (targeting the 10-min window)
            var bkDiffMs = bkDateTime.getTime() - nowMs;
            var bkDiffMin = bkDiffMs / (1000 * 60);

            if (bkDiffMin >= 8 && bkDiffMin <= 12) {
              var bkName = ((bk.first_name || '') + ' ' + (bk.last_name || '')).trim() || bk.email;
              var bkHr = parseInt(bkParts[0]);
              var bkAmpm = bkHr >= 12 ? 'PM' : 'AM';
              var bkHr12 = bkHr > 12 ? bkHr - 12 : (bkHr === 0 ? 12 : bkHr);
              var bkTimeLabel = bkHr12 + ':' + bkParts[1] + ' ' + bkAmpm;

              await sendSMS('+12063135883', 'REMINDER: Consultation with ' + bkName + ' in 10 minutes (' + bkTimeLabel + ' EST). ' + (bk.phone || '') + ' ' + (bk.email || ''));

              await supabase.from('ae_bookings').update({ reminder_10min_sent: true }).eq('id', bk.id);
            }
          }
        }
      } catch (bkErr) { console.error('Booking reminder error:', bkErr); }

      return res.status(200).json({ success: true, results: results });
    }

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('webinar-reminders error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ===== HELPERS =====
async function getWebinar(id) {
  const { data } = await supabase.from('ae_webinars').select('*').eq('id', id).single();
  return data;
}

async function autoEnrollWebinarCampaign(triggerType, registrant, webinar) {
  try {
    // Find active campaigns with this trigger type
    const { data: campaigns } = await supabase
      .from('ae_drip_campaigns')
      .select('id, name')
      .eq('trigger_type', triggerType)
      .eq('status', 'active');

    if (!campaigns || campaigns.length === 0) return;

    var contactName = ((registrant.first_name || '') + ' ' + (registrant.last_name || '')).trim() || registrant.email;
    var now = new Date().toISOString();

    for (var ci = 0; ci < campaigns.length; ci++) {
      var camp = campaigns[ci];

      // Check if already enrolled
      const { data: existing } = await supabase
        .from('ae_drip_enrollments')
        .select('id')
        .eq('campaign_id', camp.id)
        .ilike('contact_email', registrant.email)
        .maybeSingle();

      if (existing) continue;

      // Get first step to calculate next_send_at
      const { data: firstStep } = await supabase
        .from('ae_drip_steps')
        .select('delay_days')
        .eq('campaign_id', camp.id)
        .eq('step_order', 1)
        .maybeSingle();

      var delayDays = firstStep ? firstStep.delay_days : 0;
      var nextSend = new Date();
      nextSend.setDate(nextSend.getDate() + delayDays);

      await supabase.from('ae_drip_enrollments').insert({
        campaign_id: camp.id,
        contact_email: registrant.email,
        contact_name: contactName,
        contact_phone: registrant.phone || '',
        lo_user_id: webinar.lo_user_id || 'default',
        status: 'active',
        current_step: 0,
        next_send_at: nextSend.toISOString(),
        enrolled_at: now,
        webinar_slug: webinar.slug || null,
        webinar_id: webinar.id || null
      });

      console.log('Auto-enrolled ' + registrant.email + ' in campaign: ' + camp.name);
    }
  } catch (e) {
    console.error('Auto-enroll error:', e);
  }
}

async function sendEmail(to, subject, bodyHtml) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  var unsubUrl = 'https://agent-edge-backend.vercel.app/api/unsubscribe?email=' + encodeURIComponent(to);

  var fullHtml = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:20px;background:#f9f9f9;">' +
    '<table cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#fff;padding:30px;border-radius:4px;">' +
    '<tr><td>' + bodyHtml +
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">' +
    '<a href="' + unsubUrl + '" style="color:#999;">Unsubscribe</a></div>' +
    '</td></tr></table></body></html>';

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Kristy Flach <kflach@kristyflach.com>',
        reply_to: 'KFlach@prmg.net',
        to: [to],
        subject: subject,
        html: fullHtml
      })
    });
  } catch (e) { console.error('Email send error:', e); }
}

async function sendSMS(to, message) {
  var telnyxKey = process.env.TELNYX_API_KEY;
  var telnyxFrom = process.env.TELNYX_FROM_NUMBER;
  if (!telnyxKey || !telnyxFrom) return;

  // Check SMS opt-out
  try {
    var cleanDigits = to.replace(/[^0-9]/g, '');
    if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) cleanDigits = cleanDigits.substring(1);
    var last10 = cleanDigits.slice(-10);

    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('sms_unsubscribed')
      .ilike('phone', '%' + last10)
      .maybeSingle();
    if (contact && contact.sms_unsubscribed) return;
  } catch (e) {}

  var cleanTo = to.replace(/[^0-9+]/g, '');
  if (!cleanTo.startsWith('+')) {
    if (cleanTo.startsWith('1') && cleanTo.length === 11) cleanTo = '+' + cleanTo;
    else if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
  }

  try {
    await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + telnyxKey },
      body: JSON.stringify({ from: telnyxFrom, to: cleanTo, text: message })
    });
  } catch (e) { console.error('SMS send error:', e); }
}
