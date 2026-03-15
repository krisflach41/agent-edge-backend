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

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ success: false, message: 'Supabase not configured' });
  }

  var action = req.query.action || (req.body && req.body.action) || '';

  // ===== GENERATE AE ID HELPER =====
  async function generateAeId() {
    try {
      var maxRows = await supaGet(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/crm_contacts?select=ae_id&ae_id=not.is.null&order=ae_id.desc&limit=1');
      if (maxRows && maxRows.length > 0 && maxRows[0].ae_id) {
        var lastNum = parseInt(maxRows[0].ae_id.replace('AE-', ''), 10);
        if (!isNaN(lastNum)) return 'AE-' + (lastNum + 1);
      }
      // Also check users table in case signup created higher IDs
      var maxUserRows = await supaGet(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/users?select=ae_id&ae_id=not.is.null&order=ae_id.desc&limit=1');
      if (maxUserRows && maxUserRows.length > 0 && maxUserRows[0].ae_id) {
        var lastUserNum = parseInt(maxUserRows[0].ae_id.replace('AE-', ''), 10);
        if (!isNaN(lastUserNum)) return 'AE-' + (lastUserNum + 1);
      }
    } catch (e) {
      console.error('AE ID gen error:', e);
    }
    return 'AE-' + (10000 + Date.now() % 10000);
  }

  // ===== GET: LIST / SEARCH / SINGLE =====
  if (req.method === 'GET') {

    // Single contact by ID
    if (action === 'get' && req.query.id) {
      try {
        var contact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + req.query.id);
        if (!contact || contact.length === 0) {
          return res.status(404).json({ success: false, message: 'Not found' });
        }
        var c = contact[0];
        unpackData(c);
        var activity = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_activity?crm_id=eq.' + req.query.id + '&order=date.desc&limit=50');
        return res.status(200).json({ success: true, contact: c, activity: activity || [] });
      } catch (err) {
        return res.status(500).json({ success: false, message: err.toString() });
      }
    }

    // List / search
    try {
      var url = '/rest/v1/crm_contacts?order=name.asc';

      // Root type filter
      if (req.query.root_type) {
        url += '&root_type=eq.' + req.query.root_type;
      }
      // Legacy type filter (still works for backward compat)
      if (req.query.type) {
        url += '&type=eq.' + req.query.type;
      }

      // Designation filter — uses JSONB containment
      if (req.query.designation) {
        url += '&designations=cs.["' + req.query.designation + '"]';
      }

      // Search
      if (req.query.q) {
        var q = req.query.q;
        url += '&or=(name.ilike.*' + q + '*,email.ilike.*' + q + '*,phone.ilike.*' + q + '*,company.ilike.*' + q + '*,tags.ilike.*' + q + '*,ae_id.ilike.*' + q + '*)';
      }

      var contacts = await supaGet(SUPABASE_URL, SUPABASE_KEY, url);
      (contacts || []).forEach(function(c) { unpackData(c); });
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

      var isNew = !c.id;
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
      var personalFields = [
        'first_name','middle_initial','last_name',
        'own_rent','own_or_rent','monthly_payment','retain_sell','retain_or_sell',
        'prev_address','prev_city','prev_state','prev_zip',
        'marital_status','dependents','years_school',
        'linked_to','relationship','license_number'
      ];
      personalFields.forEach(function(f) {
        if (c[f] !== undefined && c[f] !== null) richData[f] = c[f];
      });

      var row = {
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        type: c.type || c.root_type || 'other',
        root_type: c.root_type || c.type || 'other',
        designations: c.designations || [],
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
        // Update — don't overwrite root_type if not provided
        if (!c.root_type && existing[0].root_type) {
          row.root_type = existing[0].root_type;
        }
        // Don't overwrite ae_id
        delete row.ae_id;
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + c.id, 'PATCH', row);
      } else {
        // Insert — generate AE ID for new contacts
        row.ae_id = c.ae_id || await generateAeId();
        row.created_at = c.createdAt || new Date().toISOString();
        if (!row.root_type || row.root_type === 'other') {
          row.root_type = c.root_type || c.type || 'client';
        }
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', row);
      }

      return res.status(200).json({ success: true, id: c.id, ae_id: row.ae_id || null });

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

    // --- PIPELINE LINK ---
    } else if (action === 'pipelineLink') {
      var p = req.body;
      if (!p.pipelineId || !p.name) {
        return res.status(400).json({ success: false, message: 'Missing pipelineId or name' });
      }

      // Check if already linked
      var byPipeline = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?pipeline_id=eq.' + p.pipelineId);
      if (byPipeline && byPipeline.length > 0) {
        return res.status(200).json({ success: true, crmId: byPipeline[0].id, ae_id: byPipeline[0].ae_id, message: 'Already linked' });
      }

      // Check by name + email match
      if (p.email) {
        var byEmail = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?name=ilike.' + encodeURIComponent(p.name) + '&email=ilike.' + encodeURIComponent(p.email));
        if (byEmail && byEmail.length > 0) {
          // Add borrower designation if not already there
          var existingDesignations = byEmail[0].designations || [];
          if (existingDesignations.indexOf('borrower') === -1) {
            existingDesignations.push('borrower');
          }
          await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + byEmail[0].id, 'PATCH', {
            pipeline_id: p.pipelineId,
            designations: existingDesignations,
            updated_at: new Date().toISOString()
          });
          return res.status(200).json({ success: true, crmId: byEmail[0].id, ae_id: byEmail[0].ae_id, message: 'Linked existing' });
        }
      }

      // Create new CRM entry with AE ID
      var newAeId = await generateAeId();
      var newId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', {
        id: newId,
        ae_id: newAeId,
        name: p.name,
        email: p.email || null,
        phone: p.phone || null,
        type: 'client',
        root_type: 'client',
        designations: ['borrower'],
        source: 'pipeline',
        pipeline_id: p.pipelineId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      return res.status(200).json({ success: true, crmId: newId, ae_id: newAeId, message: 'Created new' });

    // --- ADD DESIGNATION ---
    } else if (action === 'addDesignation') {
      var adId = req.body.crm_id;
      var designation = req.body.designation;
      if (!adId || !designation) return res.status(400).json({ success: false, message: 'Missing crm_id or designation' });

      var adContact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + adId + '&select=id,designations');
      if (!adContact || adContact.length === 0) return res.status(404).json({ success: false, message: 'Contact not found' });

      var desigs = adContact[0].designations || [];
      if (desigs.indexOf(designation) === -1) {
        desigs.push(designation);
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + adId, 'PATCH', {
          designations: desigs, updated_at: new Date().toISOString()
        });
      }
      return res.status(200).json({ success: true, designations: desigs });

    // --- REMOVE DESIGNATION ---
    } else if (action === 'removeDesignation') {
      var rdId = req.body.crm_id;
      var rdDesig = req.body.designation;
      if (!rdId || !rdDesig) return res.status(400).json({ success: false, message: 'Missing crm_id or designation' });

      var rdContact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + rdId + '&select=id,designations');
      if (!rdContact || rdContact.length === 0) return res.status(404).json({ success: false, message: 'Contact not found' });

      var rdDesigs = rdContact[0].designations || [];
      rdDesigs = rdDesigs.filter(function(d) { return d !== rdDesig; });
      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + rdId, 'PATCH', {
        designations: rdDesigs, updated_at: new Date().toISOString()
      });
      return res.status(200).json({ success: true, designations: rdDesigs });

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
          crm_id: e.crm_id, type: 'email_sent', subject: e.subject,
          body: e.bodyPreview || e.subject, date: new Date().toISOString()
        });
      }
      return res.status(200).json({ success: true, emailId: sendData.id });

    // --- CLEAR LINK ---
    } else if (action === 'clearLink') {
      var clearId = req.body.crm_id;
      if (!clearId) return res.status(400).json({ success: false, message: 'Missing crm_id' });
      var clearContact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + clearId + '&select=id,data');
      if (clearContact && clearContact.length > 0) {
        var cData = clearContact[0].data || {};
        delete cData.linked_to;
        delete cData.relationship;
        await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + clearId, 'PATCH', {
          data: cData, updated_at: new Date().toISOString()
        });
      }
      return res.status(200).json({ success: true, message: 'Link cleared' });

    // --- GET LINKED CONTACTS ---
    } else if (action === 'getLinkedContacts') {
      var linkId = req.body.crm_id;
      if (!linkId) return res.status(400).json({ success: false, message: 'Missing crm_id' });

      var results = [];
      var thisContact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + linkId + '&select=id,name,data');
      if (thisContact && thisContact.length > 0) {
        var myData = thisContact[0].data;
        if (myData && myData.linked_to) {
          var linkedTo = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + myData.linked_to + '&select=id,name,type,root_type,phone,email,ae_id');
          if (linkedTo && linkedTo.length > 0) {
            results.push({
              direction: 'linked_to', contact_id: linkedTo[0].id,
              contact_name: linkedTo[0].name, contact_type: linkedTo[0].root_type || linkedTo[0].type,
              ae_id: linkedTo[0].ae_id || '', relationship: myData.relationship || ''
            });
          }
        }
      }

      var coBorrowerOf = await supaGet(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/crm_contacts?select=id,name,type,root_type,phone,email,ae_id&data->>linked_to=eq.' + linkId);
      var coBorrowerOf2 = await supaGet(SUPABASE_URL, SUPABASE_KEY,
        '/rest/v1/crm_contacts?select=id,name,type,root_type,data,ae_id&data->co_borrowers=cs.[{"contact_id":"' + linkId + '"}]');

      var seen = {};
      (coBorrowerOf || []).forEach(function(c) {
        if (c.id !== linkId && !seen[c.id]) {
          seen[c.id] = true;
          results.push({ direction: 'linked_from', contact_id: c.id,
            contact_name: c.name, contact_type: c.root_type || c.type,
            ae_id: c.ae_id || '', relationship: '' });
        }
      });
      (coBorrowerOf2 || []).forEach(function(c) {
        if (c.id !== linkId && !seen[c.id]) {
          seen[c.id] = true;
          var rel = '';
          if (c.data && c.data.co_borrowers) {
            var match = c.data.co_borrowers.find(function(cb) { return cb.contact_id === linkId; });
            if (match) rel = match.relationship || '';
          }
          results.push({ direction: 'co_borrower_on', contact_id: c.id,
            contact_name: c.name, contact_type: c.root_type || c.type,
            ae_id: c.ae_id || '', relationship: rel });
        }
      });

      return res.status(200).json({ success: true, links: results });

    // --- CREATE LINKED CONTACT (spouse/co-borrower with auto-populate) ---
    } else if (action === 'createLinkedContact') {
      var lc = req.body;
      if (!lc.source_crm_id || !lc.name) {
        return res.status(400).json({ success: false, message: 'Missing source_crm_id or name' });
      }

      // Fetch source contact for auto-populate
      var sourceContact = await supaGet(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts?id=eq.' + lc.source_crm_id);
      var src = (sourceContact && sourceContact.length > 0) ? sourceContact[0] : {};

      var newId = 'crm-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      var newAeId = await generateAeId();
      var newRootType = lc.root_type || 'client';

      // Auto-populate shared fields from source
      var newContact = {
        id: newId,
        ae_id: newAeId,
        name: lc.name,
        email: lc.email || null,
        phone: lc.phone || null,
        type: newRootType,
        root_type: newRootType,
        designations: lc.designations || [],
        company: src.company || null,
        address: src.address || null,
        city: src.city || null,
        state: src.state || null,
        zip: src.zip || null,
        source: 'linked_contact',
        data: { linked_to: lc.source_crm_id, relationship: lc.relationship || 'spouse' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await supaFetch(SUPABASE_URL, SUPABASE_KEY, '/rest/v1/crm_contacts', 'POST', newContact);

      return res.status(200).json({ success: true, id: newId, ae_id: newAeId });

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

  } catch (error) {
    console.error('CRM API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}

// ===== UNPACK JSONB DATA =====
function unpackData(c) {
  if (c.data && typeof c.data === 'object') {
    var richData = c.data;
    Object.keys(richData).forEach(function(k) {
      if (c[k] === undefined || c[k] === null) c[k] = richData[k];
    });
    if (richData.employers) c.employers = richData.employers;
    if (richData.education) c.education = richData.education;
    if (richData.assets) c.assets = richData.assets;
    if (richData.reos) c.reos = richData.reos;
    if (richData.documents) c.documents = richData.documents;
    if (richData.co_borrowers) c.co_borrowers = richData.co_borrowers;
    if (richData.shared_loan) c.shared_loan = richData.shared_loan;
  }
  // Ensure designations is always an array
  if (!c.designations) c.designations = [];
  // Ensure root_type falls back to type
  if (!c.root_type && c.type) c.root_type = c.type;
}

// ===== SUPABASE HELPERS =====
async function supaGet(url, key, path) {
  var resp = await fetch(url + path, {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
  });
  return await resp.json();
}

async function supaFetch(url, key, path, method, body) {
  var headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };
  var opts = { method: method, headers: headers };
  if (body && (method === 'POST' || method === 'PATCH')) { opts.body = JSON.stringify(body); }
  var resp = await fetch(url + path, opts);
  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error(method + ' failed: ' + resp.status + ' ' + errText);
  }
  return resp;
}
