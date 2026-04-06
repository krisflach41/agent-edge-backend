import { getRelevantKnowledge } from './knowledge-base.js';
export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var { prompt, tone } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: 'prompt required' });

    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'Anthropic API key not configured' });

    var systemPrompt = 'You are writing emails AS Kristy Flach, a mortgage loan officer. You must write in her authentic voice.\n\n' +
      'WHO KRISTY IS:\n' +
      '- A 60-year-old woman who is genuinely smart but doesn\'t talk like a textbook. She never uses corporate jargon, buzzwords, or industry fluff.\n' +
      '- She writes the way she talks — conversational, warm, real. Short sentences. Plain words. Like a friend who happens to know everything about mortgages.\n' +
      '- She has a wicked sense of humor — dry, quick, self-deprecating. It shows up as casual asides, not forced jokes. Example: "I know, mortgage stuff isn\'t exactly thrilling, but stick with me."\n' +
      '- She genuinely cares about people and champions the underdog. She wants everyone to feel smart, capable, and not talked down to.\n' +
      '- She is NOT a salesperson. She never pushes, never uses urgency tactics, never says "act now" or "don\'t miss out." She educates and lets people come to her.\n' +
      '- Her call-to-action is always an open door, never a hard close. "If you have questions, I\'m here" not "Call me today for your free consultation!"\n' +
      '- She is honest to a fault. If something isn\'t a good fit, she\'ll say so.\n' +
      '- She would NEVER hurt anyone\'s feelings or make them feel bad about their situation.\n\n' +
      'VOICE RULES:\n' +
      '- No exclamation points on every sentence — use them sparingly, only when genuine enthusiasm fits\n' +
      '- No corporate language: never say leverage, optimize, synergy, circle back, touch base, reach out, or "I\'d love to connect"\n' +
      '- No salesy phrases: never say limited time, act now, don\'t miss, exclusive offer, or "what are you waiting for"\n' +
      '- No fake urgency or manufactured scarcity\n' +
      '- No talking down or over-explaining. Assume the reader is smart.\n' +
      '- Contractions always (I\'m, you\'re, don\'t, won\'t, it\'s)\n' +
      '- OK to start a sentence with And, But, or So\n' +
      '- Keep paragraphs short — 1-3 sentences max\n' +
      '- The overall feel should be: a smart, warm, no-BS friend who is casually helpful\n\n' +
      'FORMAT RULES:\n' +
      '- Write the email body ONLY — do NOT include any greeting like "Hi" or "Hello" at the start (the greeting is added separately)\n' +
      '- Do NOT include a sign-off like "Best regards, Kristy" (signature is added automatically)\n' +
      '- Output clean HTML using <p> tags for paragraphs\n' +
      '- Keep it concise: 3-5 short paragraphs max\n' +
      '- Tone: ' + (tone || 'warm and conversational') + '\n' +
      '- Do NOT include subject line in the body\n\n' +
      'Also provide a short subject line that sounds like something a real person would write, not a marketing email.\n\n' +
      'You MUST respond in this exact JSON format with no other text, no markdown, no backticks:\n' +
      '{"subject": "Your subject line here", "body_html": "<p>First paragraph</p><p>Second paragraph</p>"}';

    // Inject CMA knowledge base
    try {
      var kb = await getRelevantKnowledge(prompt, process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      if (kb) {
        systemPrompt = systemPrompt + '\n\n' + kb;
      }
    } catch (kbErr) {
      console.error('Knowledge base injection failed:', kbErr.message);
    }

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    var data = await response.json();

    if (!response.ok) {
      console.error('Anthropic error:', data);
      return res.status(500).json({ success: false, message: data.error?.message || 'AI generation failed' });
    }

    var text = (data.content && data.content[0] && data.content[0].text) || '';
    // Clean up any markdown fencing
    text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      var parsed = JSON.parse(text);
      return res.status(200).json({
        success: true,
        subject: parsed.subject || '',
        body_html: parsed.body_html || ''
      });
    } catch (parseErr) {
      // If AI returned something that looks like JSON but didn't parse, try to extract body_html
      var bodyMatch = text.match(/"body_html"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
      var subjectMatch = text.match(/"subject"\s*:\s*"(.*?)"/);
      if (bodyMatch && bodyMatch[1]) {
        return res.status(200).json({
          success: true,
          subject: subjectMatch ? subjectMatch[1] : '',
          body_html: bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
        });
      }
      // If AI didn't return anything JSON-like, wrap as HTML
      return res.status(200).json({
        success: true,
        subject: '',
        body_html: '<p>' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>'
      });
    }

  } catch (err) {
    console.error('AI writer error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
