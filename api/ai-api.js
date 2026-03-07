// /api/ai-api.js — Central AI endpoint for Agent Edge
// All AI features across the platform route through here.
// Kristy's profile, voice, and credentials are defined once.
//
// POST { action, ...params }
//
// Actions:
//   blog-draft        { topic }                        → { draft: { title, category, summary, body } }
//   blog-polish       { text, instructions? }          → { result: html }
//   video-script      { topic, format, audience }      → { result: string }
//   video-rewrite     { script, instructions }         → { result: string }
//   social-caption    { draft, platforms }             → { result: string }
//   social-hashtags   { caption }                      → { result: string }
//   credit-letter     { analysis }                     → { result: string }
//   scenario-response { scenario, context? }           → { result: string }
//   general           { prompt, instructions? }        → { result: string }

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

  // ============================================================
  // KRISTY'S PROFILE — defined once, used everywhere
  // ============================================================
  const KRISTY_PROFILE = `
You are writing as or for Kristy Flach.

WHO SHE IS:
Kristy Flach is a Certified Mortgage Advisor (CMA) and Loan Officer at Paramount Residential Mortgage Group (PRMG), NMLS #2632259, licensed in 49 states, with over 20 years in the mortgage industry.

WHAT A CMA IS:
The Certified Mortgage Advisor designation is the highest standard of excellence for mortgage professionals in the United States. It goes beyond traditional loan officer training and focuses on how mortgage decisions fit into a broader financial picture — personal wealth creation, stock and bond markets, technical market analysis, economic reports, central banking, Federal Reserve policy, and what truly drives interest rates.

HER PLATFORM — AGENT EDGE:
Kristy built her own SaaS platform called Agent Edge. Her YouTube channel is "House Money with Kristy" — an educational platform for borrowers and realtors.

HER HERO STATEMENT:
"A mortgage can be as simple as a payment you make to keep a roof over your head — or it can be a tool you use to create financial independence."

HER VOICE — THIS IS CRITICAL:
- Playful, funny, warm — she makes people feel at ease in a process that stresses most people out
- Honest to a fault — she only says things she knows to be true. No hype, no fluff, no overclaiming.
- Always on the client's side — she's the person in the room fighting for them, not selling at them
- She wants to be the person they trust before they even need her
- Serious about helping people, light about everything else
- SHORT. Punchy. Conversational. She talks like a real person, not a LinkedIn post.
- NEVER technical for the sake of sounding smart — if a 12-year-old can't follow it, rewrite it
- Her humor is subtle and natural — it shows up in word choice and timing, not jokes
- She doesn't need to say "I care" or "I'm trustworthy" — it shows in how she talks
- She needs clients NOW — there is always a clear, low-friction call to action
- Write in first person as Kristy ("I", "my clients", "reach out to me")
`.trim();

  try {
    let systemPrompt = '';
    let userMessage = '';
    let maxTokens = 1000;
    let responseFormat = 'text'; // 'text' or 'json'

    // ============================================================
    // ACTION ROUTING
    // ============================================================

    switch (action) {

      // ---- BLOG DRAFT ----
      case 'blog-draft': {
        const { topic } = body;
        if (!topic) return res.status(400).json({ error: 'topic required' });
        maxTokens = 2000;
        responseFormat = 'json';
        systemPrompt = `${KRISTY_PROFILE}

You are writing a blog post for Kristy's website.

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no backticks, no explanation:
{"title":"...","category":"...","summary":"A 1-2 sentence summary for the blog card on the homepage","body":"The full blog post in HTML format (use <h3>, <p>, <ul>, <li>, <strong>, <em> tags). Aim for 600-900 words."}

Category must be one of: Home Buying, Refinance, Mortgage Strategy, Market Update, Credit & Finance, First-Time Buyers
Always end with a clear call to action.`;
        userMessage = `Write a mortgage blog post about: ${topic}`;
        break;
      }

      // ---- BLOG POLISH ----
      case 'blog-polish': {
        const { text, instructions } = body;
        if (!text) return res.status(400).json({ error: 'text required' });
        maxTokens = 2000;
        systemPrompt = `${KRISTY_PROFILE}

You are polishing a blog post for Kristy's website. Fix grammar, improve flow, strengthen educational value. Keep her voice and meaning.
Return ONLY the polished text in HTML format (use <h3>, <p>, <ul>, <li>, <strong>, <em> tags). No preamble, no explanation.`;
        userMessage = instructions
          ? `Rewrite this blog post with the following instructions: ${instructions}\n\n${text}`
          : `Polish this blog post:\n\n${text}`;
        break;
      }

      // ---- VIDEO SCRIPT ----
      case 'video-script': {
        const { topic, format, audience, tone } = body;
        if (!topic) return res.status(400).json({ error: 'topic required' });
        maxTokens = 800;
        systemPrompt = `${KRISTY_PROFILE}

You are writing a video teleprompter script for Kristy.

SCRIPT RULES — NON-NEGOTIABLE:
- Write EXACTLY like she talks. Short sentences. Real words. No corporate speak.
- Match the format length strictly: 60-second = ~130 words. 90-second = ~200 words. 2-minute = ~280 words. Do NOT go over.
- Hook in the first sentence — make them stop scrolling
- One clear idea per script. Don't try to cover everything.
- End with one specific, easy call to action ("DM me", "drop a comment", "link in bio", "text me")
- If discussing rates or loan products, add one line at the end: "Kristy Flach | NMLS #2632259 | Paramount Residential Mortgage Group"
- NO bullet points. NO headers. NO stage directions. Just clean sentences ready to read aloud.
- Tone: ${tone || 'conversational and warm'}

Return only the script. Nothing else.`;
        userMessage = `Write a ${format || '60-second'} video script about: ${topic}\nAudience: ${audience || 'general'}`;
        break;
      }

      // ---- VIDEO REWRITE ----
      case 'video-rewrite': {
        const { script, instructions } = body;
        if (!script || !instructions) return res.status(400).json({ error: 'script and instructions required' });
        maxTokens = 1000;
        systemPrompt = `${KRISTY_PROFILE}

You are rewriting a video teleprompter script for Kristy. Keep it as clean teleprompter copy — complete sentences, no bullets, no stage directions. Return only the rewritten script.`;
        userMessage = `Rewrite this script with the following instructions: ${instructions}\n\n${script}`;
        break;
      }

      // ---- SOCIAL CAPTION ----
      case 'social-caption': {
        const { draft, platforms } = body;
        if (!draft) return res.status(400).json({ error: 'draft required' });
        maxTokens = 500;
        systemPrompt = `${KRISTY_PROFILE}

You are writing or improving a social media caption for Kristy. Make it engaging, authentic, and professional. Keep her voice — direct, knowledgeable, warm. Return only the caption, no explanation.`;
        userMessage = `Improve this social media caption for ${platforms || 'Facebook and Instagram'}:\n\n${draft}`;
        break;
      }

      // ---- SOCIAL HASHTAGS ----
      case 'social-hashtags': {
        const { caption } = body;
        if (!caption) return res.status(400).json({ error: 'caption required' });
        maxTokens = 150;
        systemPrompt = `You generate hashtags for mortgage and real estate social media posts. Return ONLY 8-12 hashtags space-separated on one line. No explanation, no preamble.`;
        userMessage = `Generate hashtags for this post:\n\n${caption}`;
        break;
      }

      // ---- CREDIT LETTER ----
      case 'credit-letter': {
        const { analysis } = body;
        if (!analysis) return res.status(400).json({ error: 'analysis required' });
        maxTokens = 1500;
        systemPrompt = `${KRISTY_PROFILE}

You are writing a credit improvement action plan letter for one of Kristy's clients. Be specific, encouraging, and actionable. Use Kristy's direct and knowledgeable voice. Format clearly with sections. Return only the letter.`;
        userMessage = `Write a credit improvement plan based on this analysis:\n\n${JSON.stringify(analysis)}`;
        break;
      }

      // ---- SCENARIO RESPONSE ----
      case 'scenario-response': {
        const { scenario, context } = body;
        if (!scenario) return res.status(400).json({ error: 'scenario required' });
        maxTokens = 800;
        systemPrompt = `${KRISTY_PROFILE}

You are helping Kristy respond to a client or realtor scenario. Give a clear, confident, expert response she can use or adapt. Keep her voice — direct, no fluff, trusted advisor. Return only the response.`;
        userMessage = context
          ? `Scenario: ${scenario}\n\nAdditional context: ${context}`
          : `Scenario: ${scenario}`;
        break;
      }

      // ---- GENERAL ----
      case 'general': {
        const { prompt, instructions } = body;
        if (!prompt) return res.status(400).json({ error: 'prompt required' });
        maxTokens = 1000;
        systemPrompt = `${KRISTY_PROFILE}${instructions ? '\n\n' + instructions : ''}`;
        userMessage = prompt;
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // ============================================================
    // CALL ANTHROPIC
    // ============================================================
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.content && data.content[0] ? data.content[0].text.trim() : '';

    if (responseFormat === 'json') {
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return res.status(200).json({ success: true, draft: parsed });
      } catch (e) {
        return res.status(200).json({ success: true, draft: { title: '', category: 'General', summary: '', body: raw } });
      }
    }

    return res.status(200).json({ success: true, result: raw });

  } catch (err) {
    console.error('ai-api error:', err);
    return res.status(500).json({ error: 'AI request failed', detail: err.message });
  }
}
