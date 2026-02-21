import { createClient } from '@supabase/supabase-js';

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

  var action = req.query.action || (req.body && req.body.action) || '';

  try {

    // ===== GENERATE AE ID & CREATE LOAN =====
    if (action === 'createLoan') {
      var cl = req.body;
      if (!cl.user_id) return res.status(400).json({ success: false, message: 'user_id required' });
      if (!cl.crm_contact_id) return res.status(400).json({ success: false, message: 'crm_contact_id required' });
      if (!cl.pipeline_stage) return res.status(400).json({ success: false, message: 'pipeline_stage required' });

      // Generate AE ID: AE-YYMM-XXXX
      var now = new Date();
      var yy = String(now.getFullYear()).slice(2);
      var mm = String(now.getMonth() + 1).padStart(2, '0');
      var prefix = 'AE-' + yy + mm + '-';

      // Get the highest existing AE ID for this prefix
      const { data: existing } = await supabase
        .from('ae_loans')
        .select('ae_id')
        .like('ae_id', prefix + '%')
        .order('ae_id', { ascending: false })
        .limit(1);

      var nextNum = 1;
      if (existing && existing.length > 0) {
        var lastNum = parseInt(existing[0].ae_id.split('-')[2]) || 0;
        nextNum = lastNum + 1;
      }
      var aeId = prefix + String(nextNum).padStart(4, '0');

      // Create the loan record
      const { error: loanErr } = await supabase
        .from('ae_loans')
        .insert([{
          ae_id: aeId,
          user_id: cl.user_id,
          status: 'active',
          pipeline_stage: cl.pipeline_stage,
          lender_loan_number: cl.lender_loan_number || null,
          loan_type: cl.loan_type || null,
          transaction_type: cl.transaction_type || null,
          loan_program: cl.loan_program || null,
          loan_amount: cl.loan_amount || null,
          appraised_value: cl.appraised_value || null,
          interest_rate: cl.interest_rate || null,
          lock_status: cl.lock_status || null,
          occupancy: cl.occupancy || null,
          subject_street: cl.subject_street || null,
          subject_city: cl.subject_city || null,
          subject_state: cl.subject_state || null,
          subject_zip: cl.subject_zip || null,
          source: cl.source || null,
          realtor_name: cl.realtor_name || null,
          notes: cl.notes || null
        }]);

      if (loanErr) {
        console.error('Create loan error:', loanErr);
        return res.status(500).json({ success: false, message: 'Failed to create loan: ' + loanErr.message });
      }

      // Add the primary borrower
      var borrowerId = 'alb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      const { error: borrErr } = await supabase
        .from('ae_loan_borrowers')
        .insert([{
          id: borrowerId,
          ae_id: aeId,
          crm_contact_id: cl.crm_contact_id,
          role: 'primary',
          qualifying_income: cl.qualifying_income || null
        }]);

      if (borrErr) {
        console.error('Add borrower error:', borrErr);
        return res.status(500).json({ success: false, message: 'Loan created but failed to add borrower: ' + borrErr.message });
      }

      return res.status(200).json({ success: true, ae_id: aeId, borrower_id: borrowerId });
    }

    // ===== GET LOAN =====
    if (action === 'getLoan') {
      var aeId = req.body.ae_id || req.query.ae_id;
      if (!aeId) return res.status(400).json({ success: false, message: 'ae_id required' });

      const { data: loan, error: loanErr } = await supabase
        .from('ae_loans')
        .select('*')
        .eq('ae_id', aeId)
        .single();

      if (loanErr) return res.status(404).json({ success: false, message: 'Loan not found' });

      // Get borrowers with their CRM contact info
      const { data: borrowers } = await supabase
        .from('ae_loan_borrowers')
        .select('*')
        .eq('ae_id', aeId)
        .order('added_at', { ascending: true });

      // Fetch CRM names for each borrower
      var enrichedBorrowers = [];
      if (borrowers && borrowers.length > 0) {
        var crmIds = borrowers.map(function(b) { return b.crm_contact_id; });
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, name, email, phone')
          .in('id', crmIds);

        var contactMap = {};
        (contacts || []).forEach(function(c) {
          contactMap[c.id] = c;
        });

        enrichedBorrowers = borrowers.map(function(b) {
          var c = contactMap[b.crm_contact_id] || {};
          return {
            id: b.id,
            ae_id: b.ae_id,
            crm_contact_id: b.crm_contact_id,
            role: b.role,
            qualifying_income: b.qualifying_income,
            added_at: b.added_at,
            name: c.name || 'Unknown',
            email: c.email || '',
            phone: c.phone || ''
          };
        });
      }

      return res.status(200).json({ success: true, loan: loan, borrowers: enrichedBorrowers });
    }

    // ===== UPDATE LOAN =====
    if (action === 'updateLoan') {
      var cl = req.body;
      if (!cl.ae_id) return res.status(400).json({ success: false, message: 'ae_id required' });

      var updates = { updated_at: new Date().toISOString() };
      // Only include fields that were sent
      var fields = ['lender_loan_number', 'pipeline_stage', 'loan_type', 'transaction_type',
        'loan_program', 'loan_amount', 'appraised_value', 'interest_rate', 'lock_status',
        'occupancy', 'subject_street', 'subject_city', 'subject_state', 'subject_zip',
        'source', 'realtor_name', 'date_mutual', 'date_emd', 'date_appraisal',
        'date_inspection', 'date_conditional', 'date_final_approval', 'date_closing',
        'strike_rate', 'notes'];
      fields.forEach(function(f) {
        if (cl[f] !== undefined) updates[f] = cl[f];
      });

      const { error } = await supabase
        .from('ae_loans')
        .update(updates)
        .eq('ae_id', cl.ae_id);

      if (error) {
        console.error('Update loan error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update: ' + error.message });
      }

      return res.status(200).json({ success: true });
    }

    // ===== UPDATE PIPELINE STAGE =====
    if (action === 'updateStage') {
      var cl = req.body;
      if (!cl.ae_id || !cl.pipeline_stage) return res.status(400).json({ success: false, message: 'ae_id and pipeline_stage required' });

      const { error } = await supabase
        .from('ae_loans')
        .update({ pipeline_stage: cl.pipeline_stage, updated_at: new Date().toISOString() })
        .eq('ae_id', cl.ae_id);

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== LIST ACTIVE LOANS (for pipeline board) =====
    if (action === 'listActive') {
      var userId = req.body.user_id || req.query.user_id;
      if (!userId) return res.status(400).json({ success: false, message: 'user_id required' });

      const { data: loans, error } = await supabase
        .from('ae_loans')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) return res.status(500).json({ success: false, message: error.message });

      // Get all borrowers for these loans
      var aeIds = (loans || []).map(function(l) { return l.ae_id; });
      var allBorrowers = [];
      if (aeIds.length > 0) {
        const { data: borrs } = await supabase
          .from('ae_loan_borrowers')
          .select('*')
          .in('ae_id', aeIds);

        // Fetch CRM contact names
        var crmIds = (borrs || []).map(function(b) { return b.crm_contact_id; });
        var contactMap = {};
        if (crmIds.length > 0) {
          const { data: contacts } = await supabase
            .from('crm_contacts')
            .select('id, name, email, phone')
            .in('id', crmIds);
          (contacts || []).forEach(function(c) {
            contactMap[c.id] = c;
          });
        }

        allBorrowers = (borrs || []).map(function(b) {
          var c = contactMap[b.crm_contact_id] || {};
          return {
            id: b.id,
            ae_id: b.ae_id,
            crm_contact_id: b.crm_contact_id,
            role: b.role,
            qualifying_income: b.qualifying_income,
            name: c.name || 'Unknown',
            email: c.email || '',
            phone: c.phone || ''
          };
        });
      }

      return res.status(200).json({ success: true, loans: loans || [], borrowers: allBorrowers });
    }

    // ===== ADD BORROWER TO LOAN =====
    if (action === 'addBorrower') {
      var cl = req.body;
      if (!cl.ae_id || !cl.crm_contact_id) return res.status(400).json({ success: false, message: 'ae_id and crm_contact_id required' });

      // Check if already on this loan
      const { data: existing } = await supabase
        .from('ae_loan_borrowers')
        .select('id')
        .eq('ae_id', cl.ae_id)
        .eq('crm_contact_id', cl.crm_contact_id);

      if (existing && existing.length > 0) {
        return res.status(400).json({ success: false, message: 'This contact is already on this loan' });
      }

      var borrowerId = 'alb-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      const { error } = await supabase
        .from('ae_loan_borrowers')
        .insert([{
          id: borrowerId,
          ae_id: cl.ae_id,
          crm_contact_id: cl.crm_contact_id,
          role: cl.role || 'co-borrower',
          qualifying_income: cl.qualifying_income || null
        }]);

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, borrower_id: borrowerId });
    }

    // ===== REMOVE BORROWER FROM LOAN =====
    if (action === 'removeBorrower') {
      var cl = req.body;
      if (!cl.id) return res.status(400).json({ success: false, message: 'borrower link id required' });

      const { error } = await supabase
        .from('ae_loan_borrowers')
        .delete()
        .eq('id', cl.id);

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== GET ACTIVE LOANS FOR A CRM CONTACT =====
    if (action === 'getContactLoans') {
      var crmId = req.body.crm_contact_id || req.query.crm_contact_id;
      if (!crmId) return res.status(400).json({ success: false, message: 'crm_contact_id required' });

      // Find all ae_ids this contact is on
      const { data: links } = await supabase
        .from('ae_loan_borrowers')
        .select('ae_id, role')
        .eq('crm_contact_id', crmId);

      if (!links || links.length === 0) {
        return res.status(200).json({ success: true, active_loans: [], history_loans: [] });
      }

      var aeIds = links.map(function(l) { return l.ae_id; });
      var roleMap = {};
      links.forEach(function(l) { roleMap[l.ae_id] = l.role; });

      // Get the loan details
      const { data: loans } = await supabase
        .from('ae_loans')
        .select('*')
        .in('ae_id', aeIds);

      // Get all borrowers on these loans for display
      const { data: allBorrs } = await supabase
        .from('ae_loan_borrowers')
        .select('ae_id, crm_contact_id, role')
        .in('ae_id', aeIds);

      // Get CRM names for all borrowers
      var allCrmIds = (allBorrs || []).map(function(b) { return b.crm_contact_id; });
      var contactMap = {};
      if (allCrmIds.length > 0) {
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, name')
          .in('id', allCrmIds);
        (contacts || []).forEach(function(c) {
          contactMap[c.id] = c.name || 'Unknown';
        });
      }

      // Enrich borrower list per loan
      var borrowersByLoan = {};
      (allBorrs || []).forEach(function(b) {
        if (!borrowersByLoan[b.ae_id]) borrowersByLoan[b.ae_id] = [];
        borrowersByLoan[b.ae_id].push({
          crm_contact_id: b.crm_contact_id,
          role: b.role,
          name: contactMap[b.crm_contact_id] || 'Unknown'
        });
      });

      var activeLoans = [];
      var closedLoans = [];
      (loans || []).forEach(function(loan) {
        var enriched = {
          ae_id: loan.ae_id,
          status: loan.status,
          pipeline_stage: loan.pipeline_stage,
          subject_street: loan.subject_street,
          subject_city: loan.subject_city,
          subject_state: loan.subject_state,
          subject_zip: loan.subject_zip,
          loan_amount: loan.loan_amount,
          transaction_type: loan.transaction_type,
          loan_program: loan.loan_program,
          interest_rate: loan.interest_rate,
          outcome: loan.outcome,
          outcome_date: loan.outcome_date,
          my_role: roleMap[loan.ae_id] || '',
          borrowers: borrowersByLoan[loan.ae_id] || []
        };
        if (loan.status === 'active') {
          activeLoans.push(enriched);
        } else {
          closedLoans.push(enriched);
        }
      });

      return res.status(200).json({ success: true, active_loans: activeLoans, closed_loans: closedLoans });
    }

    // ===== DECISION A LOAN =====
    if (action === 'decisionLoan') {
      var cl = req.body;
      if (!cl.ae_id || !cl.outcome) return res.status(400).json({ success: false, message: 'ae_id and outcome required' });

      // Verify loan is in underwriting
      const { data: loan, error: loanErr } = await supabase
        .from('ae_loans')
        .select('*')
        .eq('ae_id', cl.ae_id)
        .single();

      if (loanErr || !loan) return res.status(404).json({ success: false, message: 'Loan not found' });
      if (loan.pipeline_stage !== 'underwriting') {
        return res.status(400).json({ success: false, message: 'Loan must be in Underwriting to decision' });
      }

      // Get all borrowers
      const { data: borrowers } = await supabase
        .from('ae_loan_borrowers')
        .select('*')
        .eq('ae_id', cl.ae_id);

      // Get CRM names for borrowers
      var crmIds = (borrowers || []).map(function(b) { return b.crm_contact_id; });
      var contactMap = {};
      if (crmIds.length > 0) {
        const { data: contacts } = await supabase
          .from('crm_contacts')
          .select('id, name')
          .in('id', crmIds);
        (contacts || []).forEach(function(c) {
          contactMap[c.id] = c.name || 'Unknown';
        });
      }

      var borrowerSnapshot = (borrowers || []).map(function(b) {
        return { name: contactMap[b.crm_contact_id] || 'Unknown', role: b.role, crm_id: b.crm_contact_id };
      });

      var now = new Date().toISOString();
      var outcomeDate = cl.outcome_date || now.split('T')[0];

      // Update the loan status
      const { error: updateErr } = await supabase
        .from('ae_loans')
        .update({
          status: cl.outcome,
          outcome: cl.outcome,
          outcome_date: outcomeDate,
          strike_rate: cl.strike_rate || loan.strike_rate || null,
          interest_rate: cl.interest_rate || loan.interest_rate || null,
          loan_amount: cl.loan_amount || loan.loan_amount || null,
          notes: cl.notes || loan.notes || null,
          updated_at: now
        })
        .eq('ae_id', cl.ae_id);

      if (updateErr) {
        console.error('Decision update error:', updateErr);
        return res.status(500).json({ success: false, message: 'Failed to update loan: ' + updateErr.message });
      }

      // Find the primary borrower for the history record
      var primaryBorrower = (borrowers || []).find(function(b) { return b.role === 'primary'; });
      var primaryName = primaryBorrower ? (contactMap[primaryBorrower.crm_contact_id] || 'Unknown') : 'Unknown';

      // Build subject address
      var subjectAddress = [loan.subject_street, loan.subject_city, loan.subject_state, loan.subject_zip].filter(Boolean).join(', ');

      // Create loan history record
      var historyId = 'lh-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
      const { error: histErr } = await supabase
        .from('loan_history')
        .insert([{
          id: historyId,
          ae_id: cl.ae_id,
          crm_contact_id: primaryBorrower ? primaryBorrower.crm_contact_id : null,
          outcome: cl.outcome,
          outcome_date: outcomeDate,
          loan_number: loan.lender_loan_number || null,
          primary_name: primaryName,
          borrowers: borrowerSnapshot,
          loan_type: loan.loan_type || null,
          transaction_type: loan.transaction_type || null,
          loan_program: loan.loan_program || null,
          loan_amount: cl.loan_amount || loan.loan_amount || null,
          interest_rate: cl.interest_rate || loan.interest_rate || null,
          lock_status: loan.lock_status || null,
          subject_address: subjectAddress,
          appraised_value: loan.appraised_value || null,
          strike_rate: cl.strike_rate || loan.strike_rate || null,
          source: loan.source || null,
          realtor_name: loan.realtor_name || null,
          dates: {
            mutual: loan.date_mutual, emd: loan.date_emd,
            appraisal: loan.date_appraisal, inspection: loan.date_inspection,
            conditional: loan.date_conditional, final_approval: loan.date_final_approval,
            closing: loan.date_closing
          },
          notes: cl.notes || null,
          created_at: now,
          updated_at: now
        }]);

      if (histErr) {
        console.error('History insert error:', histErr);
        // Don't fail the whole operation — loan is already decisioned
      }

      // Update each borrower's CRM type to past_client (if currently borrower)
      for (var i = 0; i < crmIds.length; i++) {
        // Get current contact data
        const { data: contact } = await supabase
          .from('crm_contacts')
          .select('id, data')
          .eq('id', crmIds[i])
          .single();

        if (contact && contact.data) {
          var contactData = typeof contact.data === 'string' ? JSON.parse(contact.data) : contact.data;
          if (contactData.type === 'borrower') {
            contactData.type = 'past_client';
            await supabase
              .from('crm_contacts')
              .update({ data: contactData })
              .eq('id', crmIds[i]);
          }
        }
      }

      return res.status(200).json({ success: true, ae_id: cl.ae_id, history_id: historyId });
    }

    // ===== REACTIVATE LOAN =====
    if (action === 'reactivateLoan') {
      var cl = req.body;
      if (!cl.ae_id || !cl.pipeline_stage) return res.status(400).json({ success: false, message: 'ae_id and pipeline_stage required' });

      const { data: loan } = await supabase
        .from('ae_loans')
        .select('status')
        .eq('ae_id', cl.ae_id)
        .single();

      if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
      if (loan.status !== 'suspended' && loan.status !== 'withdrawn') {
        return res.status(400).json({ success: false, message: 'Only suspended or withdrawn loans can be reactivated' });
      }

      const { error } = await supabase
        .from('ae_loans')
        .update({
          status: 'active',
          outcome: null,
          outcome_date: null,
          pipeline_stage: cl.pipeline_stage,
          updated_at: new Date().toISOString()
        })
        .eq('ae_id', cl.ae_id);

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true });
    }

    // ===== GET LOAN HISTORY BY CRM CONTACT =====
    if (action === 'getHistory') {
      var crmId = req.body.crm_contact_id || req.query.crm_contact_id;
      if (!crmId) return res.status(400).json({ success: false, message: 'crm_contact_id required' });

      // Find all ae_ids this contact is/was on
      const { data: links } = await supabase
        .from('ae_loan_borrowers')
        .select('ae_id')
        .eq('crm_contact_id', crmId);

      var aeIds = (links || []).map(function(l) { return l.ae_id; });

      // Also check loan_history directly for crm_contact_id (legacy records)
      var history = [];

      if (aeIds.length > 0) {
        const { data: aeHist } = await supabase
          .from('loan_history')
          .select('*')
          .in('ae_id', aeIds)
          .order('outcome_date', { ascending: false });
        history = aeHist || [];
      }

      // Also get legacy records (no ae_id, but has crm_contact_id)
      const { data: legacyHist } = await supabase
        .from('loan_history')
        .select('*')
        .eq('crm_contact_id', crmId)
        .is('ae_id', null)
        .order('outcome_date', { ascending: false });

      // Merge, dedupe by id
      var ids = history.map(function(h) { return h.id; });
      (legacyHist || []).forEach(function(h) {
        if (ids.indexOf(h.id) === -1) { history.push(h); ids.push(h.id); }
      });

      return res.status(200).json({ success: true, history: history });
    }

    // ===== GET MONTHLY FUNDED (for dashboard) =====
    if (action === 'getMonthlyFunded') {
      var monthStart = req.body.month_start || req.query.month_start;
      if (!monthStart) return res.status(400).json({ success: false, message: 'month_start required' });

      const { data: history, error } = await supabase
        .from('loan_history')
        .select('id, ae_id, outcome, outcome_date, loan_amount')
        .eq('outcome', 'funded')
        .gte('outcome_date', monthStart)
        .order('outcome_date', { ascending: false });

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, history: history || [] });
    }

    // ===== GET MONTHLY DECISIONS (all outcomes for dashboard chart) =====
    if (action === 'getMonthlyDecisions') {
      var monthStart = req.body.month_start || req.query.month_start;
      if (!monthStart) return res.status(400).json({ success: false, message: 'month_start required' });

      const { data: history, error } = await supabase
        .from('loan_history')
        .select('id, ae_id, outcome, outcome_date, loan_amount')
        .gte('outcome_date', monthStart)
        .order('outcome_date', { ascending: false });

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.status(200).json({ success: true, history: history || [] });
    }

    return res.status(400).json({ success: false, message: 'Unknown action: ' + action });

  } catch (err) {
    console.error('AE Loans API error:', err);
    return res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
}
