// /api/webinar-api.js — Webinar management API for Agent Edge
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    var { action } = req.body;

    // ===== SAVE WEBINAR =====
    if (action === 'save_webinar') {
      var w = req.body.webinar;
      if (!w || !w.title) return res.status(400).json({ success: false, message: 'Title required' });

      var record = {
        lo_user_id: w.lo_user_id || 'default',
        title: w.title,
        slug: w.slug,
        city: w.city,
        webinar_date: w.webinar_date,
        webinar_time: w.webinar_time,
        timezone: w.timezone,
        timezone_abbr: w.timezone_abbr,
        pretty_date: w.pretty_date,
        formatted_datetime: w.formatted_datetime,
        zoom_link: w.zoom_link,
        booking_link: w.booking_link,
        replay_url: w.replay_url || null,
        headline: w.headline,
        subheadline: w.subheadline,
        expect_text: w.expect_text,
        speaker_bio: w.speaker_bio,
        host_name: w.host_name,
        host_email: w.host_email,
        host_phone: w.host_phone,
        cobrand_crm_id: w.cobrand_crm_id || null,
        cobrand_name: w.cobrand_name || null,
        cobrand_company: w.cobrand_company || null,
        cobrand_phone: w.cobrand_phone || null,
        cobrand_email: w.cobrand_email || null,
        cobrand_headshot_url: w.cobrand_headshot_url || null,
        status: w.status || 'draft'
      };

      if (w.id) {
        // Update existing
        const { data, error } = await supabase
          .from('ae_webinars')
          .update(record)
          .eq('id', w.id)
          .select()
          .single();
        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, webinar: data });
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('ae_webinars')
          .insert(record)
          .select()
          .single();
        if (error) return res.status(500).json({ success: false, message: error.message });
        return res.status(200).json({ success: true, webinar: data, webinar_id: data.id });
      }
    }

    // ===== LIST WEBINARS =====
    if (action === 'list_webinars') {
      var loUser = req.body.lo_user_id || 'default';
      const { data, error } = await supabase
        .from('ae_webinars')
        .select('*')
        .eq('lo_user_id', loUser)
        .order('webinar_date', { ascending: false });
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Get registration counts per webinar
      for (var i = 0; i < (data || []).length; i++) {
        try {
          const { count: regCount } = await supabase
            .from('ae_webinar_registrants')
            .select('*', { count: 'exact', head: true })
            .eq('webinar_id', data[i].id);
          data[i].registered_count = regCount || 0;

          const { count: attCount } = await supabase
            .from('ae_webinar_registrants')
            .select('*', { count: 'exact', head: true })
            .eq('webinar_id', data[i].id)
            .eq('attended', true);
          data[i].attended_count = attCount || 0;
        } catch (e) {
          data[i].registered_count = 0;
          data[i].attended_count = 0;
        }
      }

      return res.status(200).json({ success: true, webinars: data || [] });
    }

    // ===== DELETE WEBINAR =====
    if (action === 'delete_webinar') {
      var webinarId = req.body.webinar_id;
      if (!webinarId) return res.status(400).json({ success: false, message: 'webinar_id required' });

      // Delete registrants first
      await supabase.from('ae_webinar_registrants').delete().eq('webinar_id', webinarId);
      // Delete webinar
      const { error } = await supabase.from('ae_webinars').delete().eq('id', webinarId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== REGISTER FOR WEBINAR =====
    if (action === 'register') {
      var r = req.body;
      if (!r.webinar_id || !r.email) return res.status(400).json({ success: false, message: 'webinar_id and email required' });

      // Check if already registered
      const { data: existing } = await supabase
        .from('ae_webinar_registrants')
        .select('id')
        .eq('webinar_id', r.webinar_id)
        .ilike('email', r.email)
        .maybeSingle();

      if (existing) {
        return res.status(200).json({ success: true, already_registered: true, registrant_id: existing.id });
      }

      // Insert registrant
      const { data: reg, error: regErr } = await supabase
        .from('ae_webinar_registrants')
        .insert({
          webinar_id: r.webinar_id,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          email: r.email,
          phone: r.phone || '',
          pipeline_stage: 'registered',
          attended: false,
          registered_at: new Date().toISOString()
        })
        .select()
        .single();
      if (regErr) return res.status(500).json({ success: false, message: regErr.message });

      // Also create/update CRM contact
      try {
        const { data: crmExisting, error: crmLookupErr } = await supabase
          .from('crm_contacts')
          .select('id')
          .ilike('email', r.email)
          .maybeSingle();

        if (crmLookupErr) {
          console.error('CRM lookup error:', JSON.stringify(crmLookupErr));
        }

        if (!crmExisting) {
          var crmId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
          var fullName = ((r.first_name || '') + ' ' + (r.last_name || '')).trim();
          const { error: crmInsertErr } = await supabase.from('crm_contacts').insert({
            id: crmId,
            name: fullName,
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            email: r.email,
            phone: r.phone || '',
            source: 'webinar_register',
            type: 'client',
            root_type: 'client',
            lo_user_id: r.lo_user_id || 'default',
            data: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          if (crmInsertErr) {
            console.error('CRM INSERT FAILED:', JSON.stringify(crmInsertErr));
          } else {
            console.log('CRM contact created:', crmId, fullName);
          }
        } else {
          console.log('CRM contact already exists:', crmExisting.id);
        }
      } catch (e) { console.error('CRM contact create error:', e.message || e); }

      // Fire confirmation email + text immediately
      try {
        await fetch('https://agent-edge-backend.vercel.app/api/webinar-reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_confirmation',
            webinar_id: r.webinar_id,
            first_name: r.first_name || '',
            email: r.email,
            phone: r.phone || ''
          })
        });
      } catch (e) { console.error('Confirmation send error:', e); }

      return res.status(200).json({ success: true, registrant: reg });
    }

    // ===== MARK ATTENDED =====
    if (action === 'mark_attended') {
      var regId = req.body.registrant_id;
      if (!regId) return res.status(400).json({ success: false, message: 'registrant_id required' });

      const { error } = await supabase
        .from('ae_webinar_registrants')
        .update({ attended: true, attended_at: new Date().toISOString(), pipeline_stage: 'attended' })
        .eq('id', regId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== UPDATE PIPELINE STAGE =====
    if (action === 'update_stage') {
      var { registrant_id, stage } = req.body;
      if (!registrant_id || !stage) return res.status(400).json({ success: false, message: 'registrant_id and stage required' });

      const { data: regData } = await supabase
        .from('ae_webinar_registrants')
        .select('crm_id')
        .eq('id', registrant_id)
        .single();

      const { error } = await supabase
        .from('ae_webinar_registrants')
        .update({ pipeline_stage: stage })
        .eq('id', registrant_id);
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Update linked CRM card if exists
      if (regData && regData.crm_id) {
        try {
          await supabase
            .from('crm_contacts')
            .update({ tags: 'webinar:' + stage, updated_at: new Date().toISOString() })
            .eq('id', regData.crm_id);
        } catch (e) { console.error('CRM stage sync error:', e); }
      }

      return res.status(200).json({ success: true });
    }

    // ===== GET WEBINAR BY SLUG =====
    if (action === 'get_by_slug') {
      var slug = req.body.slug;
      if (!slug) return res.status(400).json({ success: false, message: 'slug required' });

      const { data, error } = await supabase
        .from('ae_webinars')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) return res.status(500).json({ success: false, message: error.message });
      if (!data) return res.status(404).json({ success: false, message: 'Webinar not found' });
      return res.status(200).json({ success: true, webinar: data });
    }

    // ===== LIST REGISTRANTS =====
    if (action === 'list_registrants') {
      var wId = req.body.webinar_id;
      if (!wId) return res.status(400).json({ success: false, message: 'webinar_id required' });

      const { data, error } = await supabase
        .from('ae_webinar_registrants')
        .select('*')
        .eq('webinar_id', wId)
        .order('registered_at', { ascending: true });
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, registrants: data || [] });
    }

    // ===== SAVE NOTES =====
    if (action === 'save_notes') {
      var { registrant_id, notes } = req.body;
      if (!registrant_id) return res.status(400).json({ success: false, message: 'registrant_id required' });

      const { error } = await supabase
        .from('ae_webinar_registrants')
        .update({ notes: notes || '' })
        .eq('id', registrant_id);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== CREATE CRM FROM REGISTRANT =====
    if (action === 'create_crm_from_registrant') {
      var regId = req.body.registrant_id;
      var loUser = req.body.lo_user_id || 'default';
      if (!regId) return res.status(400).json({ success: false, message: 'registrant_id required' });

      // Get registrant
      const { data: reg, error: regErr } = await supabase
        .from('ae_webinar_registrants')
        .select('*')
        .eq('id', regId)
        .single();
      if (regErr || !reg) return res.status(400).json({ success: false, message: 'Registrant not found' });

      // Check if CRM already exists for this email
      const { data: existing } = await supabase
        .from('crm_contacts')
        .select('id')
        .ilike('email', reg.email)
        .maybeSingle();

      if (existing) {
        // Link existing CRM card and update source/tags
        await supabase.from('ae_webinar_registrants').update({ crm_id: existing.id }).eq('id', regId);
        await supabase.from('crm_contacts').update({
          source: 'webinar',
          tags: 'webinar:' + (reg.pipeline_stage || 'registered'),
          updated_at: new Date().toISOString()
        }).eq('id', existing.id);
        return res.status(200).json({ success: true, crm_id: existing.id, already_existed: true });
      }

      // Get webinar title for notes
      var webinarTitle = '';
      try {
        const { data: wb } = await supabase.from('ae_webinars').select('title').eq('id', reg.webinar_id).single();
        if (wb) webinarTitle = wb.title;
      } catch (e) {}

      // Create new CRM contact
      var crmId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      var fullName = ((reg.first_name || '') + ' ' + (reg.last_name || '')).trim();
      var notesText = 'Source: Webinar Registration\nWebinar: ' + webinarTitle + '\nRegistered: ' + (reg.registered_at || '') + (reg.notes ? '\n\nNotes:\n' + reg.notes : '');

      const { error: insertErr } = await supabase.from('crm_contacts').insert({
        id: crmId,
        name: fullName,
        email: reg.email,
        phone: reg.phone || '',
        source: 'webinar',
        tags: 'webinar:' + (reg.pipeline_stage || 'registered'),
        type: 'client',
        root_type: 'client',
        data: { first_name: reg.first_name || '', last_name: reg.last_name || '', webinar_id: reg.webinar_id, webinar_title: webinarTitle, webinar_stage: reg.pipeline_stage || 'registered', notes: notesText },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      if (insertErr) return res.status(500).json({ success: false, message: insertErr.message });

      // Link CRM card to registrant
      await supabase.from('ae_webinar_registrants').update({ crm_id: crmId }).eq('id', regId);
      return res.status(200).json({ success: true, crm_id: crmId });
    }

    // ===== MOVE TO LOAN PIPELINE =====
    if (action === 'move_to_loan_pipeline') {
      var { registrant_id, crm_id, pipeline_stage, lo_user_id } = req.body;
      if (!registrant_id || !crm_id || !pipeline_stage) return res.status(400).json({ success: false, message: 'registrant_id, crm_id, and pipeline_stage required' });

      // Get CRM contact info
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', crm_id)
        .single();

      if (!contact) return res.status(400).json({ success: false, message: 'CRM contact not found' });

      // Create loan in ae_loans
      var aeId = 'AE-' + Date.now().toString(36).toUpperCase();
      const { error: loanErr } = await supabase.from('ae_loans').insert({
        ae_id: aeId,
        borrower_name: contact.name || '',
        borrower_email: contact.email || '',
        borrower_phone: contact.phone || '',
        crm_contact_id: crm_id,
        pipeline_stage: pipeline_stage,
        source: 'webinar',
        user_id: lo_user_id || 'default',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      if (loanErr) return res.status(500).json({ success: false, message: loanErr.message });

      // Update registrant to mark as moved
      await supabase.from('ae_webinar_registrants')
        .update({ pipeline_stage: 'moved_to_pipeline', moved_to_loan: true })
        .eq('id', registrant_id);

      return res.status(200).json({ success: true, ae_id: aeId });
    }

    // ===== DELETE REGISTRANT =====
    if (action === 'delete_registrant') {
      var regId = req.body.registrant_id;
      if (!regId) return res.status(400).json({ success: false, message: 'registrant_id required' });
      const { error } = await supabase.from('ae_webinar_registrants').delete().eq('id', regId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== MARK ATTENDED BY EMAIL =====
    if (action === 'mark_attended_by_email') {
      var { webinar_id, email } = req.body;
      if (!webinar_id || !email) return res.status(400).json({ success: false, message: 'webinar_id and email required' });
      const { error } = await supabase
        .from('ae_webinar_registrants')
        .update({ attended: true, attended_at: new Date().toISOString(), pipeline_stage: 'attended' })
        .eq('webinar_id', webinar_id)
        .ilike('email', email);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== BOOK CONSULTATION =====
    if (action === 'book_consultation') {
      var b = req.body;
      if (!b.booking_date || !b.booking_time || !b.email) {
        return res.status(400).json({ success: false, message: 'Date, time, and email required' });
      }

      // Check if slot already booked
      const { data: existingBooking } = await supabase
        .from('ae_bookings')
        .select('id')
        .eq('booking_date', b.booking_date)
        .eq('booking_time', b.booking_time)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (existingBooking) {
        return res.status(400).json({ success: false, message: 'This time slot has already been booked. Please select a different time.' });
      }

      // Create booking
      const { data: booking, error: bookErr } = await supabase
        .from('ae_bookings')
        .insert({
          webinar_id: b.webinar_id || null,
          first_name: b.first_name || '',
          last_name: b.last_name || '',
          email: b.email,
          phone: b.phone || '',
          booking_date: b.booking_date,
          booking_time: b.booking_time,
          status: 'confirmed',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (bookErr) return res.status(500).json({ success: false, message: bookErr.message });

      // Update webinar registrant to "attended_booked" if they exist
      if (b.webinar_id) {
        await supabase
          .from('ae_webinar_registrants')
          .update({ pipeline_stage: 'attended_booked', booked: true, booked_at: new Date().toISOString() })
          .eq('webinar_id', b.webinar_id)
          .ilike('email', b.email);
      }

      // Send notification to Kristy via SMS
      try {
        var telnyxKey = process.env.TELNYX_API_KEY;
        var telnyxFrom = process.env.TELNYX_FROM_NUMBER;
        if (telnyxKey && telnyxFrom) {
          var fullName = ((b.first_name || '') + ' ' + (b.last_name || '')).trim();
          var notifMsg = '\ud83d\udcc5 NEW BOOKING\n' + fullName + '\n' + b.email + '\n' + (b.phone || '') + '\n' + b.booking_date + ' at ' + b.booking_time + ' EST';
          await fetch('https://api.telnyx.com/v2/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + telnyxKey },
            body: JSON.stringify({ from: telnyxFrom, to: '+12063135883', text: notifMsg })
          });
        }
      } catch (e) { console.error('Booking SMS notify error:', e); }

      // Send notification via email
      try {
        var resendKey = process.env.RESEND_API_KEY;
        if (resendKey) {
          var fullName2 = ((b.first_name || '') + ' ' + (b.last_name || '')).trim();
          await fetch('https://agent-edge-backend.vercel.app/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: '+12063135883',
              message: 'Agent Edge: NEW BOOKING\n' + fullName2 + '\n' + b.email + '\n' + (b.phone || '') + '\n' + b.booking_date + ' at ' + b.booking_time + ' EST'
            })
          });
        }
      } catch (e) { console.error('Booking SMS notify error:', e); }

      return res.status(200).json({ success: true, booking: booking });
    }

    // ===== LIST BOOKINGS (for public booking page — includes blocked times) =====
    if (action === 'list_bookings') {
      var today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('ae_bookings')
        .select('booking_date, booking_time')
        .eq('status', 'confirmed')
        .gte('booking_date', today);
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Also fetch calendar events that block booking availability (out_of_office, blocked_time)
      const { data: blockedEvents } = await supabase
        .from('ae_calendar_events')
        .select('event_date, start_time, end_time, all_day, category')
        .in('category', ['out_of_office', 'blocked_time'])
        .gte('event_date', today);

      return res.status(200).json({ success: true, bookings: data || [], blocked_events: blockedEvents || [] });
    }

    // ===== LIST BOOKINGS FULL (for MC calendar — full details) =====
    if (action === 'list_bookings_full') {
      var rangeStart = req.body.start_date || new Date().toISOString().split('T')[0];
      var rangeEnd = req.body.end_date || '2099-12-31';
      const { data, error } = await supabase
        .from('ae_bookings')
        .select('*')
        .eq('status', 'confirmed')
        .gte('booking_date', rangeStart)
        .lte('booking_date', rangeEnd)
        .order('booking_date', { ascending: true });
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, bookings: data || [] });
    }

    // ===== UPDATE BOOKING =====
    if (action === 'update_booking') {
      var ub = req.body;
      if (!ub.id) return res.status(400).json({ success: false, message: 'Booking id required' });

      var updateFields = {};
      if (ub.booking_date) updateFields.booking_date = ub.booking_date;
      if (ub.booking_time) updateFields.booking_time = ub.booking_time;
      if (ub.status) updateFields.status = ub.status;
      if (ub.first_name !== undefined) updateFields.first_name = ub.first_name;
      if (ub.last_name !== undefined) updateFields.last_name = ub.last_name;
      if (ub.phone !== undefined) updateFields.phone = ub.phone;
      if (ub.email !== undefined) updateFields.email = ub.email;

      const { data, error } = await supabase
        .from('ae_bookings')
        .update(updateFields)
        .eq('id', ub.id)
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, booking: data });
    }

    // ===== CANCEL BOOKING =====
    if (action === 'cancel_booking') {
      var cbId = req.body.id;
      if (!cbId) return res.status(400).json({ success: false, message: 'Booking id required' });
      const { error } = await supabase
        .from('ae_bookings')
        .update({ status: 'cancelled' })
        .eq('id', cbId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== CALENDAR EVENTS CRUD =====
    if (action === 'list_calendar_events') {
      var ceStart = req.body.start_date || new Date().toISOString().split('T')[0];
      var ceEnd = req.body.end_date || '2099-12-31';
      // Get non-recurring events in range
      const { data: rangeEvents, error: e1 } = await supabase
        .from('ae_calendar_events')
        .select('*')
        .gte('event_date', ceStart)
        .lte('event_date', ceEnd)
        .or('repeat_type.is.null,repeat_type.eq.none')
        .order('event_date', { ascending: true });
      // Get all recurring events (regardless of date range — frontend generates occurrences)
      const { data: recurEvents, error: e2 } = await supabase
        .from('ae_calendar_events')
        .select('*')
        .not('repeat_type', 'is', null)
        .neq('repeat_type', 'none')
        .order('event_date', { ascending: true });
      if (e1) return res.status(500).json({ success: false, message: e1.message });
      var allEvents = (rangeEvents || []).concat(recurEvents || []);
      // Deduplicate by id
      var seen = {};
      allEvents = allEvents.filter(function(e) { if (seen[e.id]) return false; seen[e.id] = true; return true; });
      return res.status(200).json({ success: true, events: allEvents });
    }

    if (action === 'create_calendar_event') {
      var ce = req.body;
      if (!ce.title || !ce.event_date || !ce.category) {
        return res.status(400).json({ success: false, message: 'Title, event_date, and category required' });
      }
      const { data, error } = await supabase
        .from('ae_calendar_events')
        .insert({
          title: ce.title,
          event_date: ce.event_date,
          start_time: ce.start_time || null,
          end_time: ce.end_time || null,
          all_day: ce.all_day || false,
          category: ce.category,
          notes: ce.notes || '',
          reminder: ce.reminder || false,
          repeat_type: ce.repeat_type || 'none',
          repeat_end: ce.repeat_end || null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, event: data });
    }

    if (action === 'update_calendar_event') {
      var ue = req.body;
      if (!ue.id) return res.status(400).json({ success: false, message: 'Event id required' });
      var ueFields = {};
      if (ue.title !== undefined) ueFields.title = ue.title;
      if (ue.event_date !== undefined) ueFields.event_date = ue.event_date;
      if (ue.start_time !== undefined) ueFields.start_time = ue.start_time;
      if (ue.end_time !== undefined) ueFields.end_time = ue.end_time;
      if (ue.all_day !== undefined) ueFields.all_day = ue.all_day;
      if (ue.category !== undefined) ueFields.category = ue.category;
      if (ue.notes !== undefined) ueFields.notes = ue.notes;
      if (ue.reminder !== undefined) ueFields.reminder = ue.reminder;
      if (ue.repeat_type !== undefined) ueFields.repeat_type = ue.repeat_type;
      if (ue.repeat_end !== undefined) ueFields.repeat_end = ue.repeat_end;

      const { data, error } = await supabase
        .from('ae_calendar_events')
        .update(ueFields)
        .eq('id', ue.id)
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, event: data });
    }

    // ===== CALENDAR SMS REMINDER =====
    if (action === 'send_calendar_sms') {
      var smsTitle = req.body.title || 'Event';
      var smsTime = req.body.time || '';
      var smsPhone = req.body.phone || process.env.KRISTY_PHONE || '';
      if (!smsPhone) return res.status(200).json({ success: false, message: 'No phone configured' });

      try {
        var telnyxKey = process.env.TELNYX_API_KEY;
        var telnyxFrom = process.env.TELNYX_FROM_NUMBER;
        if (!telnyxKey || !telnyxFrom) return res.status(200).json({ success: false, message: 'Telnyx not configured' });

        var cleanTo = smsPhone.replace(/[^0-9+]/g, '');
        if (!cleanTo.startsWith('+')) {
          if (cleanTo.startsWith('1') && cleanTo.length === 11) cleanTo = '+' + cleanTo;
          else if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
        }

        var smsText = 'Reminder: ' + smsTitle + (smsTime ? ' at ' + smsTime : '') + ' — in 15 minutes';
        var smsResp = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + telnyxKey },
          body: JSON.stringify({ from: telnyxFrom, to: cleanTo, text: smsText })
        });
        var smsData = await smsResp.json();
        return res.status(200).json({ success: smsResp.ok, sms_id: smsData.data?.id || '' });
      } catch (smsErr) {
        return res.status(200).json({ success: false, message: smsErr.message });
      }
    }

    if (action === 'delete_calendar_event') {
      var deId = req.body.id;
      if (!deId) return res.status(400).json({ success: false, message: 'Event id required' });
      const { error } = await supabase
        .from('ae_calendar_events')
        .delete()
        .eq('id', deId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== LANDING PAGES CRUD =====
    if (action === 'get_landing_page') {
      var lpSlug = req.body.slug;
      if (!lpSlug) return res.status(400).json({ success: false, message: 'Slug required' });
      const { data, error } = await supabase
        .from('ae_landing_pages')
        .select('*')
        .eq('slug', lpSlug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) return res.status(500).json({ success: false, message: error.message });
      if (!data) return res.status(404).json({ success: false, message: 'Page not found' });

      // If co-branded, fetch partner info
      if (data.cobrand_crm_id) {
        const { data: partner } = await supabase
          .from('crm_contacts')
          .select('first_name, last_name, company, email, headshot_url')
          .eq('id', data.cobrand_crm_id)
          .maybeSingle();
        if (partner) {
          data.cobrand_name = ((partner.first_name || '') + ' ' + (partner.last_name || '')).trim();
          data.cobrand_company = partner.company || '';
          data.cobrand_headshot_url = partner.headshot_url || '';
        }
      }

      return res.status(200).json({ success: true, page: data });
    }

    if (action === 'list_landing_pages') {
      const { data, error } = await supabase
        .from('ae_landing_pages')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Fetch analytics counts per page
      for (var lpi = 0; lpi < (data || []).length; lpi++) {
        var pg = data[lpi];
        const { count: viewCount } = await supabase
          .from('ae_landing_analytics')
          .select('*', { count: 'exact', head: true })
          .eq('landing_page_id', pg.id)
          .eq('event_type', 'view');
        pg.views = viewCount || 0;

        const { count: clickCount } = await supabase
          .from('ae_landing_analytics')
          .select('*', { count: 'exact', head: true })
          .eq('landing_page_id', pg.id)
          .in('event_type', ['cta_click_book', 'cta_click_call', 'cta_click']);
        pg.clicks = clickCount || 0;
      }

      return res.status(200).json({ success: true, pages: data || [] });
    }

    if (action === 'create_landing_page') {
      var lp = req.body;
      if (!lp.title || !lp.slug || !lp.headline) {
        return res.status(400).json({ success: false, message: 'Title, slug, and headline required' });
      }
      // Clean slug
      var cleanSlug = lp.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      const { data, error } = await supabase
        .from('ae_landing_pages')
        .insert({
          slug: cleanSlug,
          title: lp.title,
          headline: lp.headline,
          subheadline: lp.subheadline || '',
          tag_text: lp.tag_text || 'FREE CONSULTATION',
          body_html: lp.body_html || '',
          video_url: lp.video_url || '',
          hero_image: lp.hero_image || '',
          cta_primary_text: lp.cta_primary_text || 'Book a Free Consultation',
          cta_primary_action: lp.cta_primary_action || 'book',
          cta_secondary_text: lp.cta_secondary_text || '',
          cta_secondary_action: lp.cta_secondary_action || '',
          campaign_tag: lp.campaign_tag || cleanSlug,
          cobrand_crm_id: lp.cobrand_crm_id || null,
          status: lp.status || 'draft',
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, page: data });
    }

    if (action === 'update_landing_page') {
      var ulp = req.body;
      if (!ulp.id) return res.status(400).json({ success: false, message: 'Page id required' });
      var ulpFields = {};
      ['title','slug','headline','subheadline','tag_text','body_html','video_url','hero_image',
       'cta_primary_text','cta_primary_action','cta_secondary_text','cta_secondary_action',
       'campaign_tag','cobrand_crm_id','status'].forEach(function(f) {
        if (ulp[f] !== undefined) ulpFields[f] = ulp[f];
      });
      if (ulpFields.slug) {
        ulpFields.slug = ulpFields.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      }
      const { data, error } = await supabase
        .from('ae_landing_pages')
        .update(ulpFields)
        .eq('id', ulp.id)
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, page: data });
    }

    if (action === 'delete_landing_page') {
      var dlpId = req.body.id;
      if (!dlpId) return res.status(400).json({ success: false, message: 'Page id required' });
      // Delete analytics too
      await supabase.from('ae_landing_analytics').delete().eq('landing_page_id', dlpId);
      const { error } = await supabase.from('ae_landing_pages').delete().eq('id', dlpId);
      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== LANDING PAGE ANALYTICS =====
    if (action === 'log_landing_event') {
      var le = req.body;
      await supabase.from('ae_landing_analytics').insert({
        landing_page_id: le.landing_page_id || null,
        campaign_tag: le.campaign_tag || '',
        source: le.source || '',
        event_type: le.event_type || 'view',
        visitor_id: le.visitor_id || '',
        created_at: new Date().toISOString()
      }).catch(function() {});
      return res.status(200).json({ success: true });
    }

    if (action === 'get_landing_analytics') {
      var aPageId = req.body.landing_page_id;
      const { data, error } = await supabase
        .from('ae_landing_analytics')
        .select('event_type, source, created_at')
        .eq('landing_page_id', aPageId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ success: false, message: error.message });

      // Aggregate
      var views = 0, clicks = 0, sources = {};
      (data || []).forEach(function(e) {
        if (e.event_type === 'view') views++;
        if (e.event_type.indexOf('cta_click') === 0) clicks++;
        if (e.source) {
          if (!sources[e.source]) sources[e.source] = { views: 0, clicks: 0 };
          if (e.event_type === 'view') sources[e.source].views++;
          if (e.event_type.indexOf('cta_click') === 0) sources[e.source].clicks++;
        }
      });

      return res.status(200).json({
        success: true,
        analytics: { views: views, clicks: clicks, conversion: views > 0 ? Math.round((clicks/views)*100) : 0, sources: sources, events: data || [] }
      });
    }

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('webinar-api error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
