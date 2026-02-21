import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
      try {
      var cl = req.body;
      if (!cl.contactId || !cl.outcome) {
        return res.status(400).json({ success: false, message: 'Missing contactId or outcome' });
      }

      // 1. Fetch the full pipeline contact + borrowers for the snapshot
      const { data: pClient, error: pClientErr } = await supabase
        .from('pipeline_clients')
        .select('*')
        .eq('contact_id', cl.contactId)
        .maybeSingle();

      if (pClientErr) console.error('pClient fetch error:', pClientErr);

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
        transaction_type: cl.transaction_type || (pClient ? pClient.transaction_type : ''),
        loan_program: cl.loan_program || (pClient ? pClient.loan_program : ''),
        loan_amount: cl.loan_amount || null,
        interest_rate: cl.interest_rate || (pClient ? pClient.interest_rate : ''),
        lock_status: pClient ? pClient.lock_status : '',
        subject_address: cl.subject_address || (pClient ? pClient.subject_address : ''),
        subject_street: pClient ? pClient.subject_street : '',
        subject_city: pClient ? pClient.subject_city : '',
        subject_state: pClient ? pClient.subject_state : '',
        subject_zip: pClient ? pClient.subject_zip : '',
        appraised_value: pClient ? pClient.appraised_value : null,
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
        
        try {
          await supabase.from('crm_activity').insert([{
            crm_id: crmId,
            type: activityType,
            subject: activitySubject,
            body: activityBody,
            date: now
          }]);
        } catch(e) { console.error('Activity insert error:', e); }
      }

      // 5. Archive the pipeline card (update stage, don't delete — preserve the record)
      await supabase
        .from('pipeline_clients')
        .update({ stage: cl.outcome === 'funded' ? 'closed' : 'archived', updated_at: now })
        .eq('contact_id', cl.contactId);

      // 6. Convert CRM contacts to past_client
      if (crmId) {
        try { await supabase.from('crm_contacts').update({ type: 'past_client' }).eq('id', crmId); } catch(e) { console.error('Type update error:', e); }
      }
      // Also convert any co-borrower CRM contacts
      if (pBorrowers && pBorrowers.length > 0) {
        var coBorrowerCrmIds = pBorrowers
          .filter(function(b) { return b.crm_id && b.crm_id !== crmId; })
          .map(function(b) { return b.crm_id; });
        for (var i = 0; i < coBorrowerCrmIds.length; i++) {
          try { await supabase.from('crm_contacts').update({ type: 'past_client' }).eq('id', coBorrowerCrmIds[i]); } catch(e) { console.error('Co-borrower type update error:', e); }
        }
      }

      return res.status(200).json({ success: true, historyId: historyId });

      } catch (closeLoanErr) {
        console.error('closeLoan error:', closeLoanErr);
        return res.status(500).json({ success: false, message: 'closeLoan failed: ' + (closeLoanErr.message || closeLoanErr.toString()) });
      }

    } else if (action === 'getHistory') {
      // Fetch loan history for a CRM contact
      var histCrmId = req.body.crm_contact_id || req.query.crm_contact_id;
      if (!histCrmId) {
        return res.status(400).json({ success: false, message: 'Missing crm_contact_id' });
      }
      // Primary matches
      const { data: primaryHist } = await supabase
        .from('loan_history')
        .select('id, outcome, outcome_date, primary_name, loan_type, transaction_type, loan_program, loan_amount, interest_rate, subject_address, appraised_value, borrowers, strike_rate, realtor_name, source, notes, created_at')
        .eq('crm_contact_id', histCrmId)
        .order('outcome_date', { ascending: false });

      // Also find loans where this contact was a co-borrower (in JSONB borrowers array)
      const { data: allHist } = await supabase
        .from('loan_history')
        .select('id, outcome, outcome_date, primary_name, loan_type, transaction_type, loan_program, loan_amount, interest_rate, subject_address, appraised_value, borrowers, strike_rate, realtor_name, source, notes, created_at')
        .neq('crm_contact_id', histCrmId)
        .order('outcome_date', { ascending: false });

      var combined = primaryHist || [];
      var existingIds = combined.map(function(h) { return h.id; });
      (allHist || []).forEach(function(h) {
        if (h.borrowers) {
          var found = h.borrowers.some(function(b) { return b.crm_id === histCrmId; });
          if (found && existingIds.indexOf(h.id) === -1) { combined.push(h); }
        }
      });

      return res.status(200).json({ success: true, history: combined });

    } else if (action === 'getActiveLoans') {
      // Fetch all active pipeline loans where this CRM contact appears as a borrower
      // Used to show loan relationships on CRM cards
      var loansCrmId = req.body.crm_contact_id || req.query.crm_contact_id;
      if (!loansCrmId) {
        return res.status(400).json({ success: false, message: 'Missing crm_contact_id' });
      }

      // Find all pipeline_borrowers rows where this contact is listed
      const { data: borrowerRows } = await supabase
        .from('pipeline_borrowers')
        .select('contact_id, name, role, crm_id')
        .eq('crm_id', loansCrmId);

      // Also check pipeline_clients where this is the primary CRM contact
      const { data: primaryRows } = await supabase
        .from('pipeline_clients')
        .select('contact_id, name, stage, loan_type, transaction_type, loan_program, interest_rate, loan_amount, subject_address, crm_contact_id')
        .eq('crm_contact_id', loansCrmId)
        .not('stage', 'in', '("closed","archived")');

      // Collect all pipeline contact_ids this person is on
      var pipelineIds = [];
      (borrowerRows || []).forEach(function(b) {
        if (pipelineIds.indexOf(b.contact_id) === -1) pipelineIds.push(b.contact_id);
      });
      (primaryRows || []).forEach(function(p) {
        if (pipelineIds.indexOf(p.contact_id) === -1) pipelineIds.push(p.contact_id);
      });

      if (pipelineIds.length === 0) {
        return res.status(200).json({ success: true, loans: [] });
      }

      // Fetch the full pipeline client records for these loans
      const { data: loanClients } = await supabase
        .from('pipeline_clients')
        .select('contact_id, name, stage, loan_type, transaction_type, loan_program, interest_rate, loan_amount, subject_address, crm_contact_id')
        .in('contact_id', pipelineIds)
        .not('stage', 'in', '("closed","archived")');

      // Fetch all borrowers on these loans
      const { data: loanBorrowers } = await supabase
        .from('pipeline_borrowers')
        .select('contact_id, name, role, crm_id')
        .in('contact_id', pipelineIds);

      // Build the response
      var loans = (loanClients || []).map(function(client) {
        var borrowers = (loanBorrowers || []).filter(function(b) {
          return b.contact_id === client.contact_id;
        }).map(function(b) {
          return { name: b.name, role: b.role, crm_id: b.crm_id };
        });

        // Determine this person's role on the loan
        var myRole = 'primary';
        if (client.crm_contact_id !== loansCrmId) {
          var myBorrower = borrowers.find(function(b) { return b.crm_id === loansCrmId; });
          myRole = myBorrower ? myBorrower.role : 'co-borrower';
        }

        return {
          pipeline_id: client.contact_id,
          loan_name: client.name || '',
          stage: client.stage,
          loan_type: client.loan_type || '',
          interest_rate: client.interest_rate || '',
          loan_amount: client.loan_amount || '',
          subject_address: client.subject_address || '',
          my_role: myRole,
          borrowers: borrowers
        };
      });

      return res.status(200).json({ success: true, loans: loans });

    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }

  } catch (error) {
    console.error('Pipeline API error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}
