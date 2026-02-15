export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    var sheetId = '1GTJy_IilOPiGNaJ3YxRS8UnY5iBZPiHpF2Nhbt0Zt4A';

    // Fetch Clients
    var clientsUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=Clients';
    var clientsResp = await fetch(clientsUrl);
    var clientsText = await clientsResp.text();
    var clients = parseGviz(clientsText);

    // Fetch Borrowers
    var borrowersUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=Borrowers';
    var borrowersResp = await fetch(borrowersUrl);
    var borrowersText = await borrowersResp.text();
    var borrowerRows = parseGvizRaw(borrowersText);

    // Fetch Notes
    var notesUrl = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=ContactNotes';
    var notesResp = await fetch(notesUrl);
    var notesText = await notesResp.text();
    var noteRows = parseGvizRaw(notesText);

    // Build contacts with nested borrowers and notes
    var contacts = clients.map(function(row) {
      var contactId = row[0];
      
      var contact = {
        id: contactId,
        name: row[1] || '',
        phone: row[2] || '',
        email: row[3] || '',
        stage: row[4] || 'cold',
        source: row[5] || 'organic',
        realtorName: row[6] || '',
        loanType: row[7] || '',
        loanYear: row[8] || '',
        interestRate: row[9] || '',
        lockStatus: row[10] || '',
        subjectAddress: row[11] || '',
        dates: {
          mutual: row[12] || '',
          emd: row[13] || '',
          intent: row[14] || '',
          appraisal: row[15] || '',
          inspection: row[16] || '',
          conditional: row[17] || '',
          finalApproval: row[18] || '',
          finalCD: row[19] || '',
          closing: row[20] || ''
        },
        createdAt: row[21] || '',
        updatedAt: row[22] || '',
        borrowers: [],
        notes: [],
        documents: [] // stays in localStorage for now
      };

      // Attach borrowers
      borrowerRows.forEach(function(b) {
        if (b[0] === contactId) {
          contact.borrowers.push({
            name: b[2] || '',
            currentAddress: b[3] || '',
            ownRent: b[4] || '',
            monthlyPayment: b[5] || '',
            retainSell: b[6] || '',
            employer: b[7] || '',
            selfReportedWages: b[8] || '',
            incomeType: b[9] || '',
            w2Year1: b[10] || '',
            w2Year2: b[11] || '',
            ytd: b[12] || '',
            qualifyingEarnings: b[13] || ''
          });
        }
      });

      // Sort borrowers by index
      // (they should already be in order from the sheet)

      // Attach notes
      noteRows.forEach(function(n) {
        if (n[0] === contactId) {
          contact.notes.push({
            type: n[2] || 'phone',
            text: n[3] || '',
            date: n[4] || ''
          });
        }
      });

      // If no borrowers, add empty one
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
    return res.status(500).json({ success: false, contacts: [], message: error.toString() });
  }
}

// Parse Google Viz JSON into array of row arrays (skip header)
function parseGviz(text) {
  var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!jsonStr) return [];
  var json = JSON.parse(jsonStr[1]);
  var rows = json.table.rows || [];
  return rows.map(function(row) {
    return row.c.map(function(cell) {
      return cell && cell.v != null ? String(cell.v) : '';
    });
  }).filter(function(row) {
    return row[0] && row[0] !== 'Contact ID';
  });
}

// Same but for borrowers/notes (returns raw arrays)
function parseGvizRaw(text) {
  var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!jsonStr) return [];
  var json = JSON.parse(jsonStr[1]);
  var rows = json.table.rows || [];
  return rows.map(function(row) {
    return row.c.map(function(cell) {
      return cell && cell.v != null ? String(cell.v) : '';
    });
  }).filter(function(row) {
    return row[0] && row[0] !== 'Contact ID';
  });
}
