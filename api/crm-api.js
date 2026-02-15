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

  var action = req.query.action || (req.body && req.body.action) || '';

  // ===== GET CRM CONTACTS =====
  if (req.method === 'GET' && (action === 'list' || action === 'search')) {
    try {
      var sheetId = '1GTJy_IilOPiGNaJ3YxRS8UnY5iBZPiHpF2Nhbt0Zt4A';
      var crmUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=CRM';
      var crmResp = await fetch(crmUrl);
      var crmText = await crmResp.text();
      var rows = parseGviz(crmText);

      var contacts = rows.map(function(row) {
        return {
          id: row[0] || '',
          name: row[1] || '',
          email: row[2] || '',
          phone: row[3] || '',
          type: row[4] || 'other',
          customType: row[5] || '',
          company: row[6] || '',
          address: row[7] || '',
          city: row[8] || '',
          state: row[9] || '',
          zip: row[10] || '',
          source: row[11] || '',
          tags: row[12] || '',
          notes: row[13] || '',
          pipelineId: row[14] || '',
          createdAt: row[15] || '',
          updatedAt: row[16] || ''
        };
      });

      // If search query provided, filter
      var q = req.query.q || '';
      if (q) {
        var ql = q.toLowerCase();
        contacts = contacts.filter(function(c) {
          return (c.name && c.name.toLowerCase().indexOf(ql) !== -1) ||
                 (c.email && c.email.toLowerCase().indexOf(ql) !== -1) ||
                 (c.phone && c.phone.indexOf(q) !== -1) ||
                 (c.company && c.company.toLowerCase().indexOf(ql) !== -1);
        });
      }

      // If type filter provided
      var typeFilter = req.query.type || '';
      if (typeFilter) {
        contacts = contacts.filter(function(c) { return c.type === typeFilter; });
      }

      return res.status(200).json({ success: true, contacts: contacts });

    } catch (error) {
      console.error('CRM list error:', error);
      return res.status(200).json({ success: true, contacts: [] });
    }
  }

  // ===== POST ACTIONS =====
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
      payload = { type: 'saveCRM', crm: req.body.crm };

    } else if (action === 'delete') {
      payload = { type: 'deleteCRM', crmId: req.body.crmId };

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
    console.error('CRM API error:', error);
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
  }).filter(function(row) { return row[0] && row[0] !== 'CRM ID'; });
}
