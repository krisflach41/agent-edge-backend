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
          transactionType: client.transaction_type || '',
          loanProgram: client.loan_program || '',
          occupancyType: client.occupancy_type || '',
          loanAmount: client.loan_amount || '',
          appraisedValue: client.appraised_value || '',
          loanNumber: client.loan_number || '',
          loanYear: client.loan_year || '',
          interestRate: client.interest_rate || '',
          lockStatus: client.lock_status || '',
          subjectAddress: client.subject_address || '',
          subjectStreet: client.subject_street || '',
          subjectCity: client.subject_city || '',
          subjectState: client.subject_state || '',
          subjectZip: client.subject_zip || '',
          crm_contact_id: client.crm_contact_id || null,
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
                role: b.role || 'borrower',
                crm_id: b.crm_id || null,
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
          documents: [],
          tasks: client.tasks || []
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
        transaction_type: contact.transactionType || null,
        loan_program: contact.loanProgram || null,
        occupancy_type: contact.occupancyType || null,
        loan_amount: contact.loanAmount || null,
        appraised_value: contact.appraisedValue || null,
        loan_number: contact.loanNumber || null,
        loan_year: contact.loanYear,
        interest_rate: contact.interestRate,
        lock_status: contact.lockStatus,
        subject_address: contact.subjectAddress,
        subject_street: contact.subjectStreet || null,
        subject_city: contact.subjectCity || null,
        subject_state: contact.subjectState || null,
        subject_zip: contact.subjectZip || null,
        crm_contact_id: contact.crm_contact_id || null,
        tasks: contact.tasks || null,
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
              role: b.role || 'borrower',
              crm_id: b.crm_id || b.crmId || null,
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

    } else if (action === 'closeLoan') {
      // ===== LOAN LIFECYCLE ENDPOINT =====
      // Handles: funded, denied, suspended, withdrawn
      // Creates history record, logs CRM activity, archives pipeline card
      var cl = req.body;
      if (!cl.contactId || !cl.outcome) {
        return res.status(400).json({ success: false, message: 'Missing contactId or outcome' });
      }

      // 1. Fetch the full pipeline contact + borrowers for the snapshot
      const { data: pClient } = await supabase
        .from('pipeline_clients')
        .select('*')
        .eq('contact_id', cl.contactId)
        .single();

      const { data: pBorrowers } = await supabase
        .from('pipeline_borrowers')
        .select('*')
        .eq('contact_id', cl.contactId);

      const { data: pNotes } = await supabase
        .from('pipeline_notes')
        .select('*')
        .eq('contact_id', cl.contactId);

      // 2. Build the history record with full snapshot
      var historyId = 'lh-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      var now = new Date().toISOString();

      var historyRecord = {
        id: historyId,
        crm_contact_id: cl.crm_contact_id || (pClient ? pClient.crm_contact_id : null),
        pipeline_contact_id: cl.contactId,
        outcome: cl.outcome,
        outcome_date: cl.outcome_date || now.split('T')[0],
        primary_name: cl.primary_name || (pClient ? pClient.name : ''),
        primary_phone: cl.primary_phone || (pClient ? pClient.phone : ''),
        primary_email: cl.primary_email || (pClient ? pClient.email : ''),
        borrowers: (pBorrowers || []).map(function(b) {
          return { name: b.name, role: b.role, crm_id: b.crm_id };
        }),
        loan_type: cl.loan_type || (pClient ? pClient.loan_type : ''),
        loan_amount: cl.loan_amount || null,
        interest_rate: cl.interest_rate || (pClient ? pClient.interest_rate : ''),
        lock_status: pClient ? pClient.lock_status : '',
        subject_address: cl.subject_address || (pClient ? pClient.subject_address : ''),
        strike_rate: cl.strike_rate || null,
        source: pClient ? pClient.source : '',
        realtor_name: pClient ? pClient.realtor_name : '',
        dates: pClient ? {
          mutual: pClient.date_mutual, emd: pClient.date_emd,
          appraisal: pClient.date_appraisal, inspection: pClient.date_inspection,
          conditional: pClient.date_conditional, final_approval: pClient.date_final_approval,
          closing: pClient.date_closing
        } : {},
        qualifying_income: cl.qualifying_income || null,
        combined_income: cl.combined_income || null,
        snapshot: {
          pipeline_client: pClient || {},
          borrowers: pBorrowers || [],
          notes: pNotes || []
        },
        notes: cl.notes || null,
        created_at: now,
        updated_at: now
      };

      // 3. Insert into loan_history
      const { error: histErr } = await supabase
        .from('loan_history')
        .insert([historyRecord]);

      if (histErr) {
        console.error('History insert error:', histErr);
        return res.status(500).json({ success: false, message: 'Failed to create history: ' + histErr.message });
      }

      // 4. Log activity on the CRM contact
      var crmId = historyRecord.crm_contact_id;
      if (crmId) {
        var activityType = cl.outcome === 'funded' ? 'loan_funded' : 'loan_' + cl.outcome;
        var activitySubject = cl.outcome === 'funded' 
          ? 'Loan Funded — ' + (cl.loan_type || 'Loan') + ' @ ' + (cl.interest_rate || '?') + '%'
          : 'Loan ' + cl.outcome.charAt(0).toUpperCase() + cl.outcome.slice(1);
        var activityBody = historyRecord.primary_name + ' | ' + (cl.loan_type || '') + ' | ' + (cl.subject_address || 'No address') + ' | ' + historyRecord.outcome_date;
        
        await supabase.from('crm_activity').insert([{
          crm_id: crmId,
          type: activityType,
          subject: activitySubject,
          body: activityBody,
          date: now
        }]).catch(function() {});
      }

      // 5. Archive the pipeline card (update stage, don't delete — preserve the record)
      await supabase
        .from('pipeline_clients')
        .update({ stage: cl.outcome === 'funded' ? 'closed' : 'archived', updated_at: now })
        .eq('contact_id', cl.contactId);

      return res.status(200).json({ success: true, historyId: historyId });

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

  } catch (error) {
    console.error('Pipeline API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}
