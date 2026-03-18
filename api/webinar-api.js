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
        headline: w.headline,
        subheadline: w.subheadline,
        expect_text: w.expect_text,
        speaker_bio: w.speaker_bio,
        host_name: w.host_name,
        host_email: w.host_email,
        host_phone: w.host_phone,
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
        const { data: crmExisting } = await supabase
          .from('crm_contacts')
          .select('id')
          .ilike('email', r.email)
          .maybeSingle();

        if (!crmExisting) {
          await supabase.from('crm_contacts').insert({
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            email: r.email,
            phone: r.phone || '',
            contact_source: 'webinar_register',
            lo_user_id: r.lo_user_id || 'default'
          });
        }
      } catch (e) { /* non-critical */ }

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

      const { error } = await supabase
        .from('ae_webinar_registrants')
        .update({ pipeline_stage: stage })
        .eq('id', registrant_id);
      if (error) return res.status(500).json({ success: false, message: error.message });
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

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('webinar-api error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
