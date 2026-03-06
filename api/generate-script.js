// /api/generate-script.js — AI script, caption, and hashtag generator for Media Lab
// POST { topic, format, audience, type }
// type: 'script' | 'caption' | 'hashtags'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, format, audience, type } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

  let prompt = '';

  if (type === 'hashtags') {
    prompt = `Generate 8-12 relevant hashtags for this mortgage/real estate social media post. Return ONLY the hashtags space-separated on one line, no explanation, no preamble:\n\n${topic}`;
  } else if (type === 'caption') {
    prompt = `Improve this social media caption for Kristy Flach, a Certified Mortgage Advisor (NMLS #2632259) at Paramount Residential Mortgage Group. Platform(s): ${audience}. Make it engaging, professional, and authentic. Keep her voice — direct, knowledgeable, approachable. Return only the improved caption, no explanation:\n\n${topic}`;
  } else {
    // Full video script
    prompt = `Write a ${format} video script for Kristy Flach, a Certified Mortgage Advisor (CMA) and Loan Officer (NMLS #2632259) at Paramount Residential Mortgage Group, licensed in 49 states with 20+ years of experience including 17 years in underwriting.

Audience: ${audience}
Topic: ${topic}

Instructions:
- Write in a conversational, confident, professional tone — Kristy's voice is direct and knowledgeable
- Format as a teleprompter script: clear complete sentences, no bullet points, no stage directions
- Include a strong hook in the first 5 seconds
- Cover 2-3 key points clearly
- End with a specific call to action
- If discussing rates, loan products, or financial advice, add this disclaimer at the end: "Rates and terms subject to change. Contact me for your personalized quote. Kristy Flach, NMLS #2632259, Paramount Residential Mortgage Group."
- Do not include any meta-commentary, just the script itself`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: type === 'hashtags' ? 100 : type === 'caption' ? 500 : 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const script = data.content && data.content[0] ? data.content[0].text.trim() : '';
    return res.status(200).json({ success: true, script });

  } catch (err) {
    console.error('generate-script error:', err);
    return res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
}
