// /api/credit-submission.js
// Receives credit simulator submissions from realtor portal or direct borrower use
// Auto-creates CRM contact in Credit Repair pipeline stage
// Auto-enrolls in credit_repair drip campaign

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ success: false, message: 'Supabase not configured' });
  }

  // ===== GET: Fetch submissions for Mission Control =====
  if (req.method === 'GET') {
    try {
      var status = req.query.status || '';
      var url = '/rest/v1/credit_submissions?order=created_at.desc&limit=50';
      if (status) url += '&status=eq.' + status;

      var subs = await supaGet(SUPABASE_URL, SUPABASE_KEY, url);
      return res.status(200).json({ success: true, submissions: subs || [] });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.toString() });
    }
  }

  // ===== POST: New submission or update =====
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var action = req.body.action || 'submit';

  // --- Submit new credit simulation ---
  if (action === 'submit') {
    try {
      var b = req.body;
      if (!b.borrower_name) {
        return res.status(400).json({ success: false, message: 'Borrower name is required' });
      }

      var submissionId = 'cs-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

      // Save submission
      var submission = {
        id: submissionId,
        borrower_name: b.borrower_name,
        borrower_email: b.borrower_email || null,
        borrower_phone: b.borrower_phone || null,
        self_reported_score: b.self_reported_score || null,
        goal_score: b.goal_score || null,
        situation_notes: b.situation_notes || null,
        simulations_ran: b.simulations_ran || null,
        submitted_by: b.submitted_by || 'direct',
        realtor_id: b.realtor_id || null,
        realtor_name: b.realtor_name || null,
        status: 'new',
        lo_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/credit_submissions', 'POST', submission);

      // Auto-create CRM contact in Credit Repair stage
      var crmId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      var contactEmail = (b.borrower_email || '').toLowerCase();

      // Check if contact already exists by email
      var existingContact = null;
      if (contactEmail) {
        var existing = await supaGet(SUPABASE_URL, SUPABASE_KEY,
          '/rest/v1/crm_contacts?email=eq.' + encodeURIComponent(contactEmail) + '&limit=1');
        if (existing && existing.length > 0) existingContact = existing[0];
      }

      if (existingContact) {
        // Update existing contact — move to credit repair if not already in pipeline
        if (!existingContact.pipeline_id || existingContact.pipeline_id === '') {
          await supaFetch(SUPABASE_URL, SUPABASE_KEY,
            '/rest/v1/crm_contacts?id=eq.' + existingContact.id, 'PATCH', {
              pipeline_stage: 'credit',
              tags: existingContact.tags ? existingContact.tags + ',credit-repair' : 'credit-repair',
              updated_at: new Date().toISOString()
            });
        }
        crmId = existingContact.id;

        // Add activity note
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity', 'POST', {
          crm_id: existingContact.id,
          type: 'note',
          date: new Date().toISOString(),
          summary: 'Credit simulator submission received. Self-reported score: ' + (b.self_reported_score || 'N/A') + '. Goal: ' + (b.goal_score || 'N/A') + '. ' + (b.situation_notes || '')
        });

      } else if (b.borrower_name) {
        // Create new CRM contact
        var newContact = {
          id: crmId,
          name: b.borrower_name,
          email: contactEmail || null,
          phone: b.borrower_phone || null,
          type: 'borrower',
          source: b.submitted_by === 'realtor' ? 'Realtor Portal - Credit Simulator' : 'Credit Simulator',
          tags: 'credit-repair',
          pipeline_stage: 'credit',
          notes: 'Auto-created from credit simulator submission. Score: ' + (b.self_reported_score || 'N/A') + '. Goal: ' + (b.goal_score || 'N/A') + '. ' + (b.situation_notes || ''),
          realtor_name: b.realtor_name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', newContact);

        // Add activity
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity', 'POST', {
          crm_id: crmId,
          type: 'note',
          date: new Date().toISOString(),
          summary: 'New contact created from credit simulator. Self-reported score: ' + (b.self_reported_score || 'N/A')
        });
      }

      // Auto-enroll in credit repair drip campaign
      if (contactEmail) {
        try {
          await fetch('https://agent-edge-backend.vercel.app/api/auto-enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trigger: 'credit_repair',
              contact_email: contactEmail,
              contact_name: b.borrower_name,
              lo_user_id: 'default'
            })
          });
        } catch (enrollErr) {
          console.error('Auto-enroll failed:', enrollErr);
          // Non-fatal — submission still succeeds
        }
      }

      return res.status(200).json({
        success: true,
        id: submissionId,
        crm_id: crmId,
        message: 'Submission received'
      });

    } catch (err) {
      console.error('Credit submission error:', err);
      return res.status(500).json({ success: false, message: err.toString() });
    }
  }

  // --- Update submission status ---
  if (action === 'updateStatus') {
    try {
      var id = req.body.id;
      var newStatus = req.body.status;
      if (!id || !newStatus) return res.status(400).json({ success: false, message: 'id and status required' });

      await supaFetch(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/credit_submissions?id=eq.' + id, 'PATCH', {
          status: newStatus,
          updated_at: new Date().toISOString()
        });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.toString() });
    }
  }

  // --- Save LO notes on submission ---
  if (action === 'saveNotes') {
    try {
      var noteId = req.body.id;
      var notes = req.body.lo_notes;
      if (!noteId) return res.status(400).json({ success: false, message: 'id required' });

      await supaFetch(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/credit_submissions?id=eq.' + noteId, 'PATCH', {
          lo_notes: notes,
          updated_at: new Date().toISOString()
        });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.toString() });
    }
  }

  return res.status(400).json({ success: false, message: 'Unknown action: ' + action });
}

// ===== Supabase helpers =====
async function supaGet(url, key, path) {
  var r = await fetch(url + path, {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  if (!r.ok) throw new Error('Supabase GET error: ' + r.status);
  return await r.json();
}

async function supaFetch(url, key, path, method, body) {
  var headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
  var opts = { method: method, headers: headers };
  if (body && (method === 'POST' || method === 'PATCH')) {
    opts.body = JSON.stringify(body);
  }
  var r = await fetch(url + path, opts);
  if (!r.ok) {
    var errText = await r.text();
    throw new Error('Supabase ' + method + ' error: ' + r.status + ' ' + errText);
  }
  return true;
}
