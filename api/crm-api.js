export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ success: false, message: 'Supabase not configured' });
  }

  var action = req.query.action || (req.body && req.body.action) || '';

  // ===== GET: LIST / SEARCH / SINGLE =====
  if (req.method === 'GET') {

    // Single contact by ID
    if (action === 'get' && req.query.id) {
      try {
        var contact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + req.query.id);
        if (!contact || contact.length === 0) {
          return res.status(404).json({ success: false, message: 'Not found' });
        }
        // Merge the JSONB 'data' column back into the contact object
        var c = contact[0];
        if (c.data && typeof c.data === 'object') {
          var richData = c.data;
          Object.keys(richData).forEach(function(k) {
            if (c[k] === undefined || c[k] === null) {
              c[k] = richData[k];
            }
          });
          // Always overwrite these from JSONB — they are the source of truth
          if (richData.employers) c.employers = richData.employers;
          if (richData.education) c.education = richData.education;
          if (richData.assets) c.assets = richData.assets;
          if (richData.reos) c.reos = richData.reos;
          if (richData.documents) c.documents = richData.documents;
          if (richData.co_borrowers) c.co_borrowers = richData.co_borrowers;
          if (richData.shared_loan) c.shared_loan = richData.shared_loan;
        }
        // Get activity history
        var activity = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity?crm_id=eq.' + req.query.id + '&order=date.desc&limit=50');
        return res.status(200).json({ success: true, contact: c, activity: activity || [] });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.toString() });
      }
    }

    // List / search
    try {
      var url = '/rest/v1/crm_contacts?order=name.asc';

      // Type filter
      if (req.query.type) {
        url += '&type=eq.' + req.query.type;
      }

      // Search by name, email, phone, company (use OR)
      if (req.query.q) {
        var q = req.query.q;
        url += '&or=(name.ilike.*' + q + '*,email.ilike.*' + q + '*,phone.ilike.*' + q + '*,company.ilike.*' + q + '*,tags.ilike.*' + q + '*)';
      }

      var contacts = await supaGet(SUPABASE_URL, SUPABASE_KEY, url);
      return res.status(200).json({ success: true, contacts: contacts || [] });

    } catch (err) {
      console.error('CRM list error:', err);
      return res.status(200).json({ success: true, contacts: [] });
    }
  }

  // ===== POST ACTIONS =====
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {

    // --- SAVE (upsert) ---
    if (action === 'save') {
      var c = req.body.crm;
      if (!c || !c.name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }

      if (!c.id) {
        c.id = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      }

      // Pack rich/nested data into the JSONB 'data' column
      var richData = {};
      if (c.employers) richData.employers = c.employers;
      if (c.education) richData.education = c.education;
      if (c.assets) richData.assets = c.assets;
      if (c.reos) richData.reos = c.reos;
      if (c.documents) richData.documents = c.documents;
      if (c.co_borrowers) richData.co_borrowers = c.co_borrowers;
      if (c.shared_loan) richData.shared_loan = c.shared_loan;
      // Borrower personal fields that don't have dedicated columns
      var personalFields = [
        'own_rent','own_or_rent','monthly_payment','retain_sell','retain_or_sell',
        'prev_address','prev_city','prev_state','prev_zip',
        'marital_status','dependents','years_school',
        'linked_to','relationship'
      ];
      personalFields.forEach(function(f) {
        if (c[f] !== undefined && c[f] !== null) richData[f] = c[f];
      });

      var row = {
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        type: c.type || 'other',
        custom_type: c.custom_type || c.customType || null,
        company: c.company || null,
        address: c.address || null,
        city: c.city || null,
        state: c.state || null,
        zip: c.zip || null,
        source: c.source || null,
        tags: c.tags || null,
        notes: c.notes || null,
        pipeline_id: c.pipeline_id || c.pipelineId || null,
        birthday: c.birthday || null,
        spouse_name: c.spouse_name || c.spouseName || null,
        kids: c.kids || null,
        employer: c.employer || null,
        job_title: c.job_title || c.jobTitle || null,
        website: c.website || null,
        facebook: c.facebook || null,
        instagram: c.instagram || null,
        linkedin: c.linkedin || null,
        tiktok: c.tiktok || null,
        realtor_name: c.realtor_name || c.realtorName || null,
        data: Object.keys(richData).length > 0 ? richData : null,
        updated_at: new Date().toISOString()
      };

      // Check if exists
      var existing = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + c.id);

      if (existing && existing.length > 0) {
        // Update
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + c.id, 'PATCH', row);
      } else {
        // Insert
        row.created_at = c.createdAt || new Date().toISOString();
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', row);
      }

      return res.status(200).json({ success: true, id: c.id });

    // --- DELETE ---
    } else if (action === 'delete') {
      var crmId = req.body.crmId;
      if (!crmId) return res.status(400).json({ success: false, message: 'Missing crmId' });

      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + crmId, 'DELETE');
      return res.status(200).json({ success: true });

    // --- ADD ACTIVITY ---
    } else if (action === 'addActivity') {
      var a = req.body.activity;
      if (!a || !a.crm_id) return res.status(400).json({ success: false, message: 'Missing activity data' });

      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity', 'POST', {
        crm_id: a.crm_id,
        type: a.type || 'note',
        subject: a.subject || null,
        body: a.body || null,
        date: a.date || new Date().toISOString()
      });

      return res.status(200).json({ success: true });

    // --- AUTO-SYNC FROM PIPELINE ---
    } else if (action === 'syncFromPipeline') {
      var p = req.body;
      if (!p.name) return res.status(200).json({ success: true, message: 'No name to sync' });

      // Check if already in CRM by pipeline_id
      var byPipeline = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?pipeline_id=eq.' + p.pipelineId);
      if (byPipeline && byPipeline.length > 0) {
        return res.status(200).json({ success: true, crmId: byPipeline[0].id, message: 'Already linked' });
      }

      // Check by name + email match
      if (p.email) {
        var byEmail = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?name=ilike.' + encodeURIComponent(p.name) + '&email=ilike.' + encodeURIComponent(p.email));
        if (byEmail && byEmail.length > 0) {
          await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + byEmail[0].id, 'PATCH', {
            pipeline_id: p.pipelineId,
            updated_at: new Date().toISOString()
          });
          return res.status(200).json({ success: true, crmId: byEmail[0].id, message: 'Linked existing' });
        }
      }

      // Create new CRM entry
      var newId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', {
        id: newId,
        name: p.name,
        email: p.email || null,
        phone: p.phone || null,
        type: 'client',
        source: 'pipeline',
        pipeline_id: p.pipelineId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      return res.status(200).json({ success: true, crmId: newId, message: 'Created new' });

    // --- SEND EMAIL + LOG ---
    } else if (action === 'sendEmail') {
      var e = req.body;
      if (!e.to || !e.subject || !e.body) {
        return res.status(400).json({ success: false, message: 'Missing to, subject, or body' });
      }

      var resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(500).json({ success: false, message: 'Resend not configured' });

      var sendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Kristy Flach <kflach@kristyflach.com>',
          reply_to: 'KFlach@prmg.net',
          to: Array.isArray(e.to) ? e.to : [e.to],
          subject: e.subject,
          html: e.body
        })
      });

      var sendData = await sendResp.json();
      if (!sendResp.ok) {
        return res.status(500).json({ success: false, message: sendData.message || 'Send failed' });
      }

      if (e.crm_id) {
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity', 'POST', {
          crm_id: e.crm_id,
          type: 'email_sent',
          subject: e.subject,
          body: e.bodyPreview || e.subject,
          date: new Date().toISOString()
        });
      }

      return res.status(200).json({ success: true, emailId: sendData.id });

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

  } catch (error) {
    console.error('CRM API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}

// ===== SUPABASE HELPERS =====
async function supaGet(url, key, path) {
  var resp = await fetch(url + path, {
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    }
  });
  return await resp.json();
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
  var resp = await fetch(url + path, opts);
  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error(method + ' failed: ' + resp.status + ' ' + errText);
  }
  return resp;
}
