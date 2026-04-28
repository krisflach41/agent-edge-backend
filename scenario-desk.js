// /api/scenario-desk.js - Scenario Desk API
// Actions:
//   ask_gus    - Claude searches lending guidelines and returns answer
//   submit_review - Saves structured scenario to Supabase for LO review

module.exports = async (req, res) => {
  // CORS
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  // ===== GET: Fetch scenarios for Mission Control =====
  if (req.method === 'GET') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    try {
      var status = req.query.status || '';
      var url = SUPABASE_URL + '/rest/v1/scenario_submissions?order=created_at.desc&limit=50';
      if (status) {
        url += '&status=eq.' + status;
      }

      var resp = await fetch(url, { headers: headers });
      var data = await resp.json();
      return res.status(200).json({ scenarios: data });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch scenarios: ' + err.message });
    }
  }

  // ===== POST: Ask Gus Gus or Submit Review =====
  var body = req.body || {};
  var action = body.action;

  // ---- ASK GUS GUS ----
  if (action === 'ask_gus') {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    var question = body.question || '';
    if (!question.trim()) return res.status(400).json({ error: 'No question provided' });

    try {
      var guidelinePrompt = `You are Gus Gus, a friendly and knowledgeable mortgage guideline assistant for real estate agents. Your job is to search your knowledge of published lending guidelines from the major programs — Fannie Mae, Freddie Mac, FHA, VA, and USDA — and provide helpful answers about borrower eligibility, property requirements, and program rules.

IMPORTANT RULES:
1. Always organize your response by PROGRAM (Fannie Mae, Freddie Mac, FHA, VA, USDA) — only include programs that are relevant to the question.
2. For each program, explain whether the scenario would likely be eligible and what the key requirements or restrictions are.
3. Be specific about minimum credit scores, waiting periods, property requirements, down payment minimums, and any special conditions.
4. If a scenario is unlikely to work with agency programs, suggest that portfolio lenders or specialty programs may be an option and recommend the realtor submit the scenario for expert review.
5. Keep your tone professional but approachable — you're helping a real estate agent, not a consumer.
6. Use **bold** for program names and key terms.
7. Keep responses focused and practical — avoid overly long explanations. Aim for thorough but scannable.
8. Never guarantee eligibility — always frame as "generally" or "typically" since overlays and updates vary by lender.

Answer this question from a real estate agent:
${question}`;

      var claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: guidelinePrompt }]
        })
      });

      var claudeData = await claudeResp.json();
      var answer = '';
      if (claudeData.content && claudeData.content.length > 0) {
        answer = claudeData.content[0].text || '';
      }

      // Log to Supabase as a hot lead (even Ask Gus questions are engagement signals)
      if (SUPABASE_URL && SUPABASE_KEY) {
        try {
          await fetch(SUPABASE_URL + '/rest/v1/scenario_submissions', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              type: 'ask_gus',
              realtor_name: body.realtor_name || 'Unknown',
              realtor_email: body.realtor_email || '',
              question: question,
              ai_response: answer,
              status: 'auto_resolved',
              scenario_data: {}
            })
          });
        } catch (logErr) {
          console.error('Failed to log Ask Gus query:', logErr);
        }
      }

      return res.status(200).json({ response: answer });

    } catch (err) {
      return res.status(500).json({ error: 'Failed to get guideline response: ' + err.message });
    }
  }

  // ---- SUBMIT REVIEW ----
  if (action === 'submit_review') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    var scenarioData = {
      scenario_types: body.scenario_types || [],
      borrower: body.borrower || {},
      property: body.property || {},
      purchase_price: body.purchase_price || '',
      down_payment: body.down_payment || ''
    };

    // Run Claude analysis as LO cheat sheet
    var aiNotes = '';
    if (ANTHROPIC_KEY) {
      try {
        var analyzePrompt = `You are a mortgage lending expert preparing notes for a loan officer who is about to call a real estate agent back about a loan scenario. Analyze this scenario and provide a concise cheat sheet the LO can reference during the call.

SCENARIO DETAILS:
Types: ${(body.scenario_types || []).join(', ')}
${body.borrower && body.borrower.credit_score ? 'Credit Score: ' + body.borrower.credit_score : ''}
${body.borrower && body.borrower.employment ? 'Employment: ' + body.borrower.employment : ''}
${body.borrower && body.borrower.first_time ? 'First-time buyer: ' + body.borrower.first_time : ''}
${body.borrower && body.borrower.credit_events && body.borrower.credit_events.length ? 'Credit events: ' + body.borrower.credit_events.join(', ') + (body.borrower.event_timeframe ? ' (' + body.borrower.event_timeframe + ' ago)' : '') : ''}
${body.property && body.property.type ? 'Property type: ' + body.property.type : ''}
${body.property && body.property.use ? 'Intended use: ' + body.property.use : ''}
${body.property && body.property.flags && body.property.flags.length ? 'Property flags: ' + body.property.flags.join(', ') : ''}
${body.purchase_price ? 'Purchase price: ' + body.purchase_price : ''}
${body.down_payment ? 'Down payment: ' + body.down_payment : ''}

Full story from the agent:
${body.full_story || 'No additional details provided.'}

PROVIDE:
1. **Likely eligible programs** — which agency programs (Fannie, Freddie, FHA, VA, USDA) could work and why
2. **Potential blockers** — what issues might disqualify this from certain programs
3. **Key questions to ask** — what the LO should ask the agent to clarify on the call
4. **Talking points** — 2-3 things the LO can say to demonstrate expertise and add value
5. **Alternative paths** — if agency doesn't work, what other options to mention (portfolio, DSCR, bank statement, etc.)

Keep it concise and actionable — this is a quick-reference cheat sheet, not a full underwrite.`;

        var cheatResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            messages: [{ role: 'user', content: analyzePrompt }]
          })
        });

        var cheatData = await cheatResp.json();
        if (cheatData.content && cheatData.content.length > 0) {
          aiNotes = cheatData.content[0].text || '';
        }
      } catch (aiErr) {
        console.error('AI analysis failed (non-blocking):', aiErr);
        aiNotes = 'AI analysis unavailable — review scenario manually.';
      }
    }

    try {
      var insertResp = await fetch(SUPABASE_URL + '/rest/v1/scenario_submissions', {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          type: 'review_request',
          realtor_name: body.realtor_name || 'Unknown',
          realtor_email: body.realtor_email || '',
          question: body.full_story || '',
          ai_response: aiNotes,
          status: 'new',
          scenario_data: scenarioData
        })
      });

      var insertData = await insertResp.json();

      // SMS notification to Kristy
      try {
        await fetch('https://agent-edge-backend.vercel.app/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: '+12063135883',
            message: 'Agent Edge: SCENARIO REVIEW\nFrom: ' + (body.realtor_name || 'Unknown') + '\nTypes: ' + (body.scenario_types || []).join(', ')
          })
        });
      } catch (smsErr) { console.error('SMS notify error:', smsErr); }

      return res.status(200).json({ success: true, id: insertData[0] ? insertData[0].id : null });

    } catch (err) {
      return res.status(500).json({ error: 'Failed to save scenario: ' + err.message });
    }
  }

  // ---- UPDATE STATUS (from Mission Control) ----
  if (action === 'update_status') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    var id = body.id;
    var newStatus = body.status;
    if (!id || !newStatus) return res.status(400).json({ error: 'id and status required' });

    var updateData = { status: newStatus };
    if (newStatus === 'called_back') updateData.called_back_at = new Date().toISOString();
    if (newStatus === 'reviewed') updateData.reviewed_at = new Date().toISOString();

    try {
      await fetch(SUPABASE_URL + '/rest/v1/scenario_submissions?id=eq.' + id, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(updateData)
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update: ' + err.message });
    }
  }

  // ---- FORWARD GUS RESPONSE TO LO (HOT LEAD) ----
  if (action === 'forward_gus') {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    try {
      var insertResp = await fetch(SUPABASE_URL + '/rest/v1/scenario_submissions', {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          type: 'forwarded_gus',
          realtor_name: body.realtor_name || 'Unknown',
          realtor_email: body.realtor_email || '',
          question: body.question || '',
          ai_response: body.gus_response || '',
          status: 'new',
          scenario_data: { realtor_notes: body.realtor_notes || '' }
        })
      });

      var insertData = await insertResp.json();
      return res.status(200).json({ success: true, id: insertData[0] ? insertData[0].id : null });

    } catch (err) {
      return res.status(500).json({ error: 'Failed to forward scenario: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
