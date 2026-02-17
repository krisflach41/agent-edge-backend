import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  // Route by action parameter
  var action = req.query.action || (req.body && req.body.action) || '';

  // ===== GET CONTACTS =====
  if (req.method === 'GET' && action === 'list') {
    try {
      // Fetch from Supabase pipeline tables
      const { data: clients, error: clientsError } = await supabase
        .from('pipeline_clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientsError) {
        console.error('Supabase clients error:', clientsError);
        return res.status(200).json({ success: true, contacts: [] });
      }

      // Fetch borrowers for all clients
      const { data: borrowers } = await supabase
        .from('pipeline_borrowers')
        .select('*');

      // Fetch notes for all clients
      const { data: notes } = await supabase
        .from('pipeline_notes')
        .select('*')
        .order('date', { ascending: false });

      // Map contacts with their borrowers and notes
      var contacts = (clients || []).map(function(client) {
        return {
          id: client.contact_id,
          name: client.name || '',
          phone: client.phone || '',
          email: client.email || '',
          stage: client.stage || 'cold',
          source: client.source || 'organic',
          realtorName: client.realtor_name || '',
          loanType: client.loan_type || '',
          loanYear: client.loan_year || '',
          interestRate: client.interest_rate || '',
          lockStatus: client.lock_status || '',
          subjectAddress: client.subject_address || '',
          dates: {
            mutual: client.date_mutual || '',
            emd: client.date_emd || '',
            intent: client.date_intent || '',
            appraisal: client.date_appraisal || '',
            inspection: client.date_inspection || '',
            conditional: client.date_conditional || '',
            finalApproval: client.date_final_approval || '',
            finalCD: client.date_final_cd || '',
            closing: client.date_closing || ''
          },
          createdAt: client.created_at || '',
          updatedAt: client.updated_at || '',
          borrowers: (borrowers || [])
            .filter(function(b) { return b.contact_id === client.contact_id; })
            .map(function(b) {
              return {
                name: b.name || '',
                currentAddress: b.current_address || '',
                ownRent: b.own_rent || '',
                monthlyPayment: b.monthly_payment || '',
                retainSell: b.retain_sell || '',
                employer: b.employer || '',
                selfReportedWages: b.self_reported_wages || '',
                incomeType: b.income_type || '',
                w2Year1: b.w2_year1 || '',
                w2Year2: b.w2_year2 || '',
                ytd: b.ytd || '',
                qualifyingEarnings: b.qualifying_earnings || ''
              };
            }),
          notes: (notes || [])
            .filter(function(n) { return n.contact_id === client.contact_id; })
            .map(function(n) {
              return {
                type: n.type || 'phone',
                text: n.text || '',
                date: n.date || ''
              };
            }),
          documents: []
        };
      });

      // Ensure each contact has at least one empty borrower
      contacts.forEach(function(contact) {
        if (contact.borrowers.length === 0) {
          contact.borrowers.push({
            name:'', currentAddress:'', ownRent:'', monthlyPayment:'',
            retainSell:'', employer:'', selfReportedWages:'', incomeType:'',
            w2Year1:'', w2Year2:'', ytd:'', qualifyingEarnings:''
          });
        }
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
    if (action === 'save') {
      const contact = req.body;
      const contactId = contact.id || 'pipeline-' + Date.now().toString(36);

      // Save client to Supabase
      const clientData = {
        contact_id: contactId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        stage: contact.stage,
        source: contact.source,
        realtor_name: contact.realtorName,
        loan_type: contact.loanType,
        loan_year: contact.loanYear,
        interest_rate: contact.interestRate,
        lock_status: contact.lockStatus,
        subject_address: contact.subjectAddress,
        date_mutual: contact.dates?.mutual,
        date_emd: contact.dates?.emd,
        date_intent: contact.dates?.intent,
        date_appraisal: contact.dates?.appraisal,
        date_inspection: contact.dates?.inspection,
        date_conditional: contact.dates?.conditional,
        date_final_approval: contact.dates?.finalApproval,
        date_final_cd: contact.dates?.finalCD,
        date_closing: contact.dates?.closing,
        updated_at: new Date().toISOString()
      };

      // Check if exists
      const { data: existing } = await supabase
        .from('pipeline_clients')
        .select('contact_id')
        .eq('contact_id', contactId)
        .single();

      if (existing) {
        // Update
        await supabase
          .from('pipeline_clients')
          .update(clientData)
          .eq('contact_id', contactId);
      } else {
        // Insert
        clientData.created_at = new Date().toISOString();
        await supabase
          .from('pipeline_clients')
          .insert([clientData]);
      }

      // Save borrowers (delete old, insert new)
      if (contact.borrowers && contact.borrowers.length > 0) {
        await supabase
          .from('pipeline_borrowers')
          .delete()
          .eq('contact_id', contactId);

        const borrowerData = contact.borrowers
          .filter(function(b) { return b.name; })
          .map(function(b) {
            return {
              contact_id: contactId,
              name: b.name,
              current_address: b.currentAddress,
              own_rent: b.ownRent,
              monthly_payment: b.monthlyPayment,
              retain_sell: b.retainSell,
              employer: b.employer,
              self_reported_wages: b.selfReportedWages,
              income_type: b.incomeType,
              w2_year1: b.w2Year1,
              w2_year2: b.w2Year2,
              ytd: b.ytd,
              qualifying_earnings: b.qualifyingEarnings
            };
          });

        if (borrowerData.length > 0) {
          await supabase
            .from('pipeline_borrowers')
            .insert(borrowerData);
        }
      }

      return res.status(200).json({ success: true, id: contactId });

    } else if (action === 'delete') {
      const contactId = req.body.contactId;
      
      // Delete from all pipeline tables
      await supabase.from('pipeline_borrowers').delete().eq('contact_id', contactId);
      await supabase.from('pipeline_notes').delete().eq('contact_id', contactId);
      await supabase.from('pipeline_clients').delete().eq('contact_id', contactId);

      return res.status(200).json({ success: true });

    } else if (action === 'updateStage') {
      await supabase
        .from('pipeline_clients')
        .update({
          stage: req.body.stage,
          updated_at: req.body.updatedAt || new Date().toISOString()
        })
        .eq('contact_id', req.body.contactId);

      return res.status(200).json({ success: true });

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

  } catch (error) {
    console.error('Pipeline API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}
