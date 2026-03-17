// ===== CRM (SUPABASE) =====
var crmLoaded = false;
var crmContacts = [];
var crmCurrentId = null;
var crmDirty = false;
var crmDeleteArmed = false;

function crmCloseCard() {
  crmCurrentId = null;
  crmDirty = false;
  document.getElementById('crmDetailContent').style.display = 'none';
  document.getElementById('crmDetailEmpty').style.display = 'flex';
  // Show New Contact button again
  var newBtn = document.getElementById('crmNewContactBtn');
  if (newBtn) newBtn.style.display = '';
  // Clear co-borrower tabs so they don't bleed into next card
  var cbTabs = document.getElementById('coBorrowerTabs');
  if (cbTabs) { cbTabs.style.display = 'none'; cbTabs.innerHTML = ''; }
  var banner = document.getElementById('crmLoanHistoryBanner');
  if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
  crmRenderList();
}

function loadCrm() {
  fetch('https://agent-edge-backend.vercel.app/api/crm-api?action=list', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      if (data.success && data.contacts) {
        crmContacts = data.contacts;
        crmLoaded = true;
        crmRenderList();
        document.getElementById('navCrmCount').textContent = crmContacts.length;
        var dce=document.getElementById('dashCrm');if(dce)dce.textContent=crmContacts.length;
        document.getElementById('crmSubtitle').textContent = crmContacts.length + ' contacts';
      }
    })
    .catch(function(err) { console.error('CRM load error:', err); });
}

function crmRenderList() {
  var search = document.getElementById('crmSearch').value.toLowerCase();
  var typeFilter = document.getElementById('crmTypeFilter').value;
  var filtered = crmContacts.filter(function(c) {
    var matchSearch = !search ||
      (c.name || '').toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.phone || '').includes(search) ||
      (c.company || '').toLowerCase().includes(search) ||
      (c.tags || '').toLowerCase().includes(search) ||
      (c.ae_id || '').toLowerCase().includes(search);
    var matchType = true;
    if (typeFilter) {
      if (typeFilter.indexOf('root:') === 0) {
        var rootVal = typeFilter.replace('root:', '');
        matchType = (c.root_type || c.type) === rootVal;
      } else if (typeFilter.indexOf('desig:') === 0) {
        var desigVal = typeFilter.replace('desig:', '');
        var desigs = c.designations || [];
        matchType = desigs.indexOf(desigVal) !== -1;
        // Legacy fallback
        if (!matchType && c.type === desigVal) matchType = true;
      } else {
        matchType = (c.root_type || c.type) === typeFilter || c.type === typeFilter;
      }
    }
    return matchSearch && matchType;
  });

  document.getElementById('crmTotalCount').textContent = filtered.length;
  var html = '';
  var badgeColors = { client: 'rgba(59,130,246,0.12);color:#3b82f6', realtor: 'rgba(34,197,94,0.12);color:#22c55e', title: 'rgba(245,158,11,0.12);color:#f59e0b', appraiser: 'rgba(168,85,247,0.12);color:#a855f7', contractor: 'rgba(239,68,68,0.12);color:#ef4444', vendor: 'rgba(20,184,166,0.12);color:#14b8a6', other: 'rgba(0,0,0,0.04);color:var(--text-muted)' };
  var badgeLabels = { client:'Client', realtor:'Realtor', title:'Title', appraiser:'Appraiser', contractor:'Contractor', vendor:'Vendor', other:'Other' };
  var desigBadgeColors = { borrower: 'rgba(14,165,233,0.12);color:#0ea5e9', past_client: 'rgba(34,197,94,0.12);color:#22c55e' };
  var desigBadgeLabels = { borrower:'Borrower', past_client:'Past Client' };

  filtered.forEach(function(c) {
    var activeClass = c.id === crmCurrentId ? ' active' : '';
    var rootType = c.root_type || c.type || 'other';
    var typeClass = ' t-' + rootType;
    var badgeStyle = badgeColors[rootType] || badgeColors.other;
    var badgeLabel = badgeLabels[rootType] || rootType || 'Other';

    // Build designation mini-badges
    var desigHtml = '';
    (c.designations || []).forEach(function(d) {
      if (desigBadgeLabels[d]) {
        desigHtml += '<span class="ci-desig" style="background:' + desigBadgeColors[d] + '">' + desigBadgeLabels[d] + '</span>';
      }
    });

    html += '<div class="crm-contact-item' + typeClass + activeClass + '" onclick="crmSelectContact(\'' + c.id + '\')">' +
      '<div><div class="ci-name">' + (c.name || 'Unnamed') + '</div><div class="ci-sub">' + (c.email || (typeof formatPhoneDisplay==='function'?formatPhoneDisplay(c.phone):c.phone) || '') + '</div></div>' +
      '<div style="text-align:right;"><div class="ci-badge" style="background:' + badgeStyle + '">' + badgeLabel + '</div>' + desigHtml + '</div></div>';
  });
  document.getElementById('crmContactList').innerHTML = html;
}

function crmConfirmDelete() {
  if (!crmCurrentId) return;
  if (!crmDeleteArmed) {
    crmDeleteArmed = true;
    document.getElementById('crmDeleteBtn').textContent = 'Confirm Delete';
    document.getElementById('crmDeleteBtn').style.background = 'rgba(239,68,68,0.15)';
    document.getElementById('crmDeleteBtn').style.color = '#ef4444';
    setTimeout(function() {
      crmDeleteArmed = false;
      document.getElementById('crmDeleteBtn').textContent = 'Delete';
      document.getElementById('crmDeleteBtn').style.background = '';
      document.getElementById('crmDeleteBtn').style.color = '';
    }, 4000);
    return;
  }
  fetch(CRM_API + '/crm-api?action=delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crmId: crmCurrentId })
  })
  .then(function(r) { return r.json(); })
  .then(function() {
    crmContacts = crmContacts.filter(function(c) { return c.id !== crmCurrentId; });
    crmCurrentId = null;
    document.getElementById('crmDetailContent').style.display = 'none';
    document.getElementById('crmDetailEmpty').style.display = 'flex';
    // Show New Contact button again
    var newBtn = document.getElementById('crmNewContactBtn');
    if (newBtn) newBtn.style.display = '';
    crmRenderList();
    showToast('Contact deleted');
    document.getElementById('navCrmCount').textContent = crmContacts.length;
    var dce=document.getElementById('dashCrm');if(dce)dce.textContent=crmContacts.length;
    document.getElementById('crmSubtitle').textContent = crmContacts.length + ' contacts';
  })
  .catch(function() { showToast('Delete failed'); });
}
function crmAddActivity() {
  if (!crmCurrentId) return;
  var type = document.getElementById('crmActivityType').value;
  var text = document.getElementById('crmActivityText').value.trim();
  if (!text) return;

  fetch(CRM_API + '/crm-api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addActivity', activity: { crm_id: crmCurrentId, type: type, subject: text, body: text } })
  })
  .then(function(r) { return r.json(); })
  .then(function() {
    document.getElementById('crmActivityText').value = '';
    crmSelectContact(crmCurrentId);
    showToast('Activity added');
  });
}

function crmOpenEmailModal() {
  if (!crmCurrentId) return;
  var c = crmContacts.find(function(x) { return x.id === crmCurrentId; });
  if (!c || !c.email) { showToast('No email address'); return; }
  document.getElementById('emailTo').value = c.email;
  document.getElementById('emailSubject').value = '';
  document.getElementById('emailBody').value = '';
  document.getElementById('emailModal').classList.add('show');
}

function handleCrmImport(input) {
  var file = input.files[0];
  if (!file) return;
  var statusEl = document.getElementById('importStatus');
  if (statusEl) { statusEl.style.display = 'block'; statusEl.innerHTML = '<div style="color:#0ea5e9;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Reading file...</div>'; }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws);
      var total = rows.length;
      var created = 0;
      var updated = 0;
      var skipped = 0;
      var processed = 0;
      var contacts = [];

      rows.forEach(function(row) {
        var firstName = String(row['First Name'] || row['first_name'] || '').trim();
        var mi = String(row['MI'] || row['Middle Initial'] || row['middle_initial'] || '').trim();
        var lastName = String(row['Last Name'] || row['last_name'] || '').trim();
        var fullName = String(row['Name'] || row['Full Name'] || row['name'] || '').trim();
        if (firstName || lastName) {
          var nameParts = [firstName];
          if (mi) nameParts.push(mi.toUpperCase() + '.');
          nameParts.push(lastName);
          fullName = nameParts.filter(Boolean).join(' ');
        }
        if (!fullName) { skipped++; return; }
        var phone = String(row['Phone'] || row['Phone Number'] || row['phone'] || '').replace(/\D/g, '');
        var type = String(row['Type'] || row['type'] || 'client').toLowerCase().trim();
        if (type === 'agent' || type === 'real estate agent') type = 'realtor';
        if (type === 'past client' || type === 'previous client') type = 'past_client';
        contacts.push({
          name: fullName, first_name: firstName || null, middle_initial: mi ? mi.toUpperCase() : null, last_name: lastName || null,
          email: String(row['Email'] || row['email'] || '').trim(), phone: phone, type: type, root_type: type,
          designations: type === 'realtor' ? ['realtor'] : [],
          company: String(row['Company'] || row['Company / Brokerage'] || row['Brokerage'] || row['company'] || '').trim(),
          source: String(row['Source'] || row['source'] || 'import').trim(),
          address: String(row['Street'] || row['Address'] || row['street'] || row['address'] || '').trim(),
          city: String(row['City'] || row['city'] || '').trim(), state: String(row['State'] || row['state'] || '').trim(),
          zip: String(row['Zip'] || row['zip'] || row['ZIP'] || row['Zip Code'] || '').trim(),
          job_title: String(row['Title'] || row['Job Title'] || row['job_title'] || '').trim(),
          license_number: String(row['License Number'] || row['license_number'] || row['MLS'] || row['MLS #'] || '').trim(),
          website: String(row['Website'] || row['website'] || '').trim(), facebook: String(row['Facebook'] || row['facebook'] || '').trim(),
          instagram: String(row['Instagram'] || row['instagram'] || '').trim(), linkedin: String(row['LinkedIn'] || row['linkedin'] || '').trim(),
          tiktok: String(row['TikTok'] || row['tiktok'] || '').trim(), tags: String(row['Tags'] || row['tags'] || '').trim() || null,
          notes: String(row['Notes'] || row['notes'] || '').trim(), verified: false
        });
      });

      function processBatch(idx) {
        var batch = contacts.slice(idx, idx + 10);
        if (batch.length === 0) {
          var sumParts = [];
          if (created > 0) sumParts.push(created + ' created');
          if (updated > 0) sumParts.push(updated + ' updated');
          if (skipped > 0) sumParts.push(skipped + ' skipped');
          if (statusEl) {
            statusEl.innerHTML = '<div style="color:#22c55e;font-size:13px;font-weight:600;"><i class="fas fa-check-circle"></i> ' + (created + updated) + ' of ' + total + ' contacts processed (' + sumParts.join(', ') + ')</div>';
            setTimeout(function() { statusEl.style.display = 'none'; }, 8000);
          }
          showToast((created + updated) + ' contacts processed');
          loadCrm();
          return;
        }
        if (statusEl) { statusEl.innerHTML = '<div style="color:#0ea5e9;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Processing ' + processed + ' of ' + contacts.length + '...</div>'; }
        Promise.all(batch.map(function(contact) {
          return fetch(API_BASE + '/crm-api', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'save', crm: contact })
          }).then(function(r) { return r.json(); }).then(function(d) {
            processed++;
            if (d && d.status === 'updated') updated++;
            else if (d && d.status === 'created') created++;
            else created++;
          }).catch(function() { processed++; skipped++; });
        })).then(function() { processBatch(idx + 10); });
      }
      processBatch(0);
    } catch (err) {
      if (statusEl) { statusEl.innerHTML = '<div style="color:#ef4444;font-size:13px;"><i class="fas fa-exclamation-circle"></i> Import failed: ' + err.message + '</div>'; }
      showToast('Import failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  input.value = '';
}

// ===== DELETE CONTACT (User Management) =====
function searchDeleteContacts() {
  var q = document.getElementById('deleteContactSearch').value.toLowerCase().trim();
  var el = document.getElementById('deleteContactResults');
  if (!el) return;
  if (q.length < 2) { el.innerHTML = ''; return; }

  var matches = (typeof crmContacts !== 'undefined' ? crmContacts : []).filter(function(c) {
    return (c.name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q);
  }).slice(0, 10);

  if (matches.length === 0) { el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted);">No contacts found</div>'; return; }

  var h = '';
  matches.forEach(function(c) {
    var typeColors = { client:'#3b82f6', borrower:'#0ea5e9', past_client:'#22c55e', realtor:'#22c55e', title:'#f59e0b', appraiser:'#a855f7', contractor:'#ef4444', vendor:'#14b8a6' };
    var tColor = typeColors[c.type] || '#888';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:4px;background:#fafbfc;">';
    h += '<div><div style="font-size:13px;font-weight:600;color:#e2e8f0;">' + (c.name || 'Unnamed') + '</div>';
    h += '<div style="font-size:11px;color:var(--text-muted);">' + (c.email || c.phone || '') + ' · <span style="color:' + tColor + ';">' + (c.type || 'other') + '</span></div></div>';
    h += '<button class="card-action-btn danger" style="font-size:11px;padding:6px 12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#ef4444;" onclick="confirmDeleteContact(\'' + c.id + '\',\'' + (c.name || '').replace(/'/g, "\\'") + '\')"><i class="fas fa-trash"></i> Delete</button>';
    h += '</div>';
  });
  el.innerHTML = h;
}

function confirmDeleteContact(id, name) {
  if (!confirm('Permanently delete ' + name + '? This cannot be undone.')) return;
  fetch(CRM_API + '/crm-api?action=delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crmId: id })
  })
  .then(function(r) { return r.json(); })
  .then(function() {
    crmContacts = crmContacts.filter(function(c) { return c.id !== id; });
    // If this contact was open, close the card
    if (crmCurrentId === id) {
      crmCurrentId = null;
      document.getElementById('crmDetailContent').style.display = 'none';
      document.getElementById('crmDetailEmpty').style.display = 'flex';
      var newBtn = document.getElementById('crmNewContactBtn');
      if (newBtn) newBtn.style.display = '';
    }
    crmRenderList();
    searchDeleteContacts(); // refresh search results
    showToast(name + ' deleted');
    document.getElementById('navCrmCount').textContent = crmContacts.length;
    var dce=document.getElementById('dashCrm');if(dce)dce.textContent=crmContacts.length;
    document.getElementById('crmSubtitle').textContent = crmContacts.length + ' contacts';
  })
  .catch(function() { showToast('Delete failed'); });
}
