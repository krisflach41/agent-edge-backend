export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Route by action parameter
  var action = req.query.action || (req.body && req.body.action) || '';

  // ===== GET CONTACTS =====
  if (req.method === 'GET' && action === 'list') {
    try {
      var sheetId = '1GTJy_IilOPiGNaJ3YxRS8UnY5iBZPiHpF2Nhbt0Zt4A';

      var clientsUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=Clients';
      var clientsResp = await fetch(clientsUrl);
      var clientsText = await clientsResp.text();
      var clients = parseGviz(clientsText);

      var borrowersUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=Borrowers';
      var borrowersResp = await fetch(borrowersUrl);
      var borrowersText = await borrowersResp.text();
      var borrowerRows = parseGvizRaw(borrowersText);

      var notesUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=ContactNotes';
      var notesResp = await fetch(notesUrl);
      var notesText = await notesResp.text();
      var noteRows = parseGvizRaw(notesText);

      var contacts = clients.map(function(row) {
        var contactId = row[0];
        var contact = {
          id: contactId,
          name: row[1] || '', phone: row[2] || '', email: row[3] || '',
          stage: row[4] || 'cold', source: row[5] || 'organic', realtorName: row[6] || '',
          loanType: row[7] || '', loanYear: row[8] || '', interestRate: row[9] || '',
          lockStatus: row[10] || '', subjectAddress: row[11] || '',
          dates: {
            mutual: row[12] || '', emd: row[13] || '', intent: row[14] || '',
            appraisal: row[15] || '', inspection: row[16] || '', conditional: row[17] || '',
            finalApproval: row[18] || '', finalCD: row[19] || '', closing: row[20] || ''
          },
          createdAt: row[21] || '', updatedAt: row[22] || '',
          borrowers: [], notes: [], documents: []
        };

        borrowerRows.forEach(function(b) {
          if (b[0] === contactId) {
            contact.borrowers.push({
              name: b[2] || '', currentAddress: b[3] || '', ownRent: b[4] || '',
              monthlyPayment: b[5] || '', retainSell: b[6] || '', employer: b[7] || '',
              selfReportedWages: b[8] || '', incomeType: b[9] || '',
              w2Year1: b[10] || '', w2Year2: b[11] || '', ytd: b[12] || '',
              qualifyingEarnings: b[13] || ''
            });
          }
        });

        noteRows.forEach(function(n) {
          if (n[0] === contactId) {
            contact.notes.push({ type: n[2] || 'phone', text: n[3] || '', date: n[4] || '' });
          }
        });

        if (contact.borrowers.length === 0) {
          contact.borrowers.push({
            name:'', currentAddress:'', ownRent:'', monthlyPayment:'',
            retainSell:'', employer:'', selfReportedWages:'', incomeType:'',
            w2Year1:'', w2Year2:'', ytd:'', qualifyingEarnings:''
          });
        }

        return contact;
      });

      return res.status(200).json({ success: true, contacts: contacts });

    } catch (error) {
      console.error('Get contacts error:', error);
      return res.status(200).json({ success: true, contacts: [] });
    }
  }

  // ===== POST ACTIONS (save, delete, updateStage) =====
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var webhookUrl = process.env.TRACKING_SHEETS_WEBHOOK;
    if (!webhookUrl) {
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    var payload = {};

    if (action === 'save') {
      payload = req.body;
      payload.type = 'saveContact';

    } else if (action === 'delete') {
      payload = { type: 'deleteContact', contactId: req.body.contactId };

    } else if (action === 'updateStage') {
      payload = {
        type: 'updateContactStage',
        contactId: req.body.contactId,
        stage: req.body.stage,
        updatedAt: req.body.updatedAt || new Date().toISOString()
      };

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Pipeline API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}

function parseGviz(text) {
  var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!jsonStr) return [];
  var json = JSON.parse(jsonStr[1]);
  var rows = json.table.rows || [];
  return rows.map(function(row) {
    return row.c.map(function(cell) { return cell && cell.v != null ? String(cell.v) : ''; });
  }).filter(function(row) { return row[0] && row[0] !== 'Contact ID'; });
}

function parseGvizRaw(text) {
  var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!jsonStr) return [];
  var json = JSON.parse(jsonStr[1]);
  var rows = json.table.rows || [];
  return rows.map(function(row) {
    return row.c.map(function(cell) { return cell && cell.v != null ? String(cell.v) : ''; });
  }).filter(function(row) { return row[0] && row[0] !== 'Contact ID'; });
}
