// /api/content-calendar.js — Content Calendar AI generator for Media Lab
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const body = req.body;
  const { action } = body;
  if (!action) return res.status(400).json({ error: 'action required' });

  const KRISTY_PROFILE = `You are writing as Kristy Flach.
WHO SHE IS: Kristy Flach is a Certified Mortgage Advisor (CMA) and Loan Officer at Paramount Residential Mortgage Group (PRMG), NMLS #2632259, licensed in 49 states (all except New York), with over 20 years in the mortgage industry. She is 60 years old, an Army veteran, a champion for underdogs. She built her own SaaS platform called Agent Edge. Her YouTube channel is "House Money with Kristy."
HER VOICE — CRITICAL:
- Conversational, warm, real. Short sentences. Plain words. Like a smart, no-BS friend who knows everything about mortgages.
- Dry, quick humor — casual asides, not forced jokes.
- NOT a salesperson. Never pushes, never uses urgency tactics.
- Honest to a fault. Would never hurt anyone's feelings.
- SHORT. Punchy. Like a real person, not a LinkedIn post.
- If a 12-year-old can't follow it, rewrite it.
- Contractions always. OK to start sentences with And, But, or So.
- No corporate language: never say leverage, optimize, synergy, circle back, touch base, reach out.
- No salesy phrases: never say limited time, act now, don't miss, exclusive offer.
- NEVER fabricate stories or client anecdotes. No made-up scenarios.
- Write in first person as Kristy.`.trim();

  const VIRAL_RULES = `SCROLL-STOPPING RULES FOR EVERY POST AND SCRIPT:

THE 3 HOOK RULE:
1. VISUAL HOOK — for videos, describe what Kristy does on camera in the first second. For posts, the first line IS the visual hook.
2. TEXT OVERLAY — 3-7 words on screen for sound-off viewers. 92% watch Instagram with sound off. Make it punchy and curiosity-driven.
3. VERBAL/WRITTEN HOOK — First sentence must make someone think "wait, what?" Use surprise, bold claims, curiosity gaps, direct challenges.

HOOK FORMULAS: "Nobody tells you this, but..." / "Stop scrolling if you..." / "This is the biggest mistake..." / "Here's what your [partner] won't say..." / "Unpopular opinion:..." / "[Common belief]? Wrong."
NEVER start with: "Hey everyone", "Happy Monday", "Did you know", "In today's video", "So today I want to talk about"

EMOTIONS THAT DRIVE SHARES: Surprise and awe are #1. Love and warmth build community. Curiosity gaps prevent scrolling. Authenticity and relatability are top traits audiences want. AVOID pure anger, sadness, or generic positivity.

CALL TO ACTION — EVERY POST MUST HAVE ONE:
- DM-DRIVING: "Comment REFI and I'll send you the breakdown" / "DM me 'tax' for the checklist"
- SHARE-DRIVING: "Send this to a realtor you work with" / "Tag a CPA who needs this"
- COLLABORATIVE: "Show this to your lender — if they can't explain it, call me"
- Keep it Kristy's style — low pressure, open door, but SPECIFIC.

KEYWORDS OVER HASHTAGS: Write searchable phrases naturally into captions. 3-5 hashtags max at the end.

COLLABORATIVE FRAMING for partner content: Talk WITH partners, not AT them. Make THEM look smart. Position the partner as the hero.

FUN FACT SIGN-OFF — EVERY POST: End with "Today's fun fact: [fact]" — totally unrelated to mortgage. State trivia, weird laws, bizarre festivals, odd state symbols, quirky Americana. Genuinely surprising or funny. Rotate across 49 states (not NY).`.trim();

  const AUDIENCE_DETAILS = `AUDIENCES:
REALTORS — Make them want to refer to Kristy. Show how she makes their deals close faster.
CPAS — Mortgage-tax intersections. When they should introduce a lender.
DIVORCE ATTORNEYS — Mortgage planning during divorce. When to bring in a lender.
FINANCIAL PLANNERS — Mortgage as wealth-building tool. Rate optimization, equity strategies.
WEDDING PROS — Help engaged couples plan financing alongside weddings.
BUYERS — First-time, move-up, investors, self-employed, credit-challenged, veterans. All loan types.
SELLERS — Selling and buying simultaneously. Bridge strategies, equity optimization.
PAST CLIENTS/SPHERE — Stay top of mind. Referral generation without being pushy.`.trim();

  try {
    let systemPrompt = '';
    let userMessage = '';
    let maxTokens = 4096;

    switch (action) {
      case 'generate-month': {
        const { month, year, audience, mood, topics, videoPostSplit } = body;
        if (!month || !year) return res.status(400).json({ error: 'month and year required' });
        const videoPercent = (videoPostSplit && videoPostSplit.video) || 80;
        const daysInMonth = new Date(year, month, 0).getDate();
        const videoDays = Math.round((videoPercent / 100) * daysInMonth);
        const postDays = daysInMonth - videoDays;

        const audienceBreakdown = audience ? Object.entries(audience).filter(([k,v]) => v > 0).map(([k,v]) => k.replace(/_/g,' ') + ': ' + Math.round((v/100)*daysInMonth) + ' days (' + v + '%)').join('\n') : 'Spread evenly';
        const moodBreakdown = mood ? Object.entries(mood).filter(([k,v]) => v > 0).map(([k,v]) => k + ': ' + Math.round((v/100)*daysInMonth) + ' days (' + v + '%)').join('\n') : 'Spread evenly';

        systemPrompt = KRISTY_PROFILE + '\n\n' + VIRAL_RULES + '\n\n' + AUDIENCE_DETAILS + '\n\nYou are generating a full month of social media content.\n\nMONTH: ' + month + '/' + year + ' (' + daysInMonth + ' days)\n\nAUDIENCE MIX:\n' + audienceBreakdown + '\n\nMOOD MIX:\n' + moodBreakdown + '\n\n' + (topics ? 'TOPICS TO COVER:\n' + topics + '\n\n' : '') + 'CONTENT SPLIT:\n- Video scripts (30 sec max, ~75 words): ' + videoDays + ' days\n- Written posts: ' + postDays + ' days\nSpread evenly.\n\nEVENTS: Check for state birthdays, holidays, awareness months, cultural events, sporting events, state fairs. Weave in state trivia.\n\nOUTPUT: Return ONLY a valid JSON object. No markdown. No backticks. No explanation before or after. Just JSON.\n{"days":[{"date":"YYYY-MM-DD","audience":"realtors|cpas|divorce_attorneys|financial_planners|wedding_pros|buyers|sellers|past_clients","mood":"educational|surprising|funny|heartfelt|bold|relatable","contentType":"video|post","topic":"Short topic 10 words max","hook":"Scroll-stopping first line","textOverlay":"3-7 words for screen or null","content":"Full content","funFact":"Today\'s fun fact: ...","event":"Event or null","cta":"Specific call to action"}]}\n\nRULES:\n- Generate ALL ' + daysInMonth + ' days. No gaps.\n- Each day unique. No filler.\n- Video scripts: 75 words MAX.\n- Posts: 80-150 words.\n- Every hook must stop scrolling.\n- Every post has a specific CTA.\n- Every post ends with fun fact.\n- Match Kristy\'s voice exactly.';

        userMessage = 'Generate the complete content calendar for ' + month + '/' + year + '. Return ONLY the JSON object. No backticks. No markdown formatting.';
        break;
      }

      case 'regenerate-day': {
        const { date, category, contentType, event } = body;
        if (!date) return res.status(400).json({ error: 'date required' });
        maxTokens = 800;
        systemPrompt = KRISTY_PROFILE + '\n\n' + VIRAL_RULES + '\n\n' + AUDIENCE_DETAILS + '\n\nRegenerate a single day. Make it COMPLETELY different — fresh angle, unexpected hook.\n\nReturn ONLY valid JSON. No backticks. No markdown:\n{"date":"' + date + '","audience":"' + (category || 'buyers') + '","mood":"surprising","contentType":"' + (contentType || 'post') + '","topic":"Short topic","hook":"Scroll-stopping line","textOverlay":"3-7 words or null","content":"Full content","funFact":"Today\'s fun fact: ...","event":null,"cta":"Specific CTA"}';
        userMessage = 'Regenerate content for ' + date + '. Audience: ' + (category || 'buyers') + '. Type: ' + (contentType || 'post') + '.' + (event ? ' Event: ' + event + '.' : '') + ' Fresh and different. ONLY JSON, no backticks.';
        break;
      }

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.content && data.content[0] ? data.content[0].text.trim() : '';

    try {
      let cleaned = raw;
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      if (cleaned.charCodeAt(0) === 0xFEFF) cleaned = cleaned.slice(1);
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ success: true, ...parsed });
    } catch (e) {
      return res.status(200).json({ success: true, raw: raw, parseError: e.message });
    }

  } catch (err) {
    console.error('content-calendar error:', err);
    return res.status(500).json({ error: 'AI request failed', detail: err.message });
  }
}
