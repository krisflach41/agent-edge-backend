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

    var apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'OpenAI API key not configured' });

    var systemPrompt = `You are an email copywriter for a mortgage loan officer. You write emails that go to real estate agents (realtors) and clients.

RULES:
- Write the email body ONLY — do NOT include "Hi {{first_name}}," at the start (that's added automatically)
- Do NOT include a sign-off like "Best regards, Kristy" (signature is added automatically)
- Output clean HTML using <p> tags for paragraphs
- Keep it concise: 3-5 short paragraphs max
- Tone: ${tone || 'warm and professional'}
- Use simple, genuine language — never salesy or pushy
- Include a soft call-to-action where appropriate
- Do NOT include subject line in the body

Also provide a short, compelling subject line (WITHOUT "Hi" or the recipient name — just the greeting part that comes BEFORE ", {{first_name}}!")

Respond in this exact JSON format only, no markdown:
{"subject": "Your subject here", "body_html": "<p>Your email body here</p>"}`;

    var response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    var data = await response.json();

    if (!response.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({ success: false, message: data.error?.message || 'AI generation failed' });
    }

    var text = data.choices?.[0]?.message?.content || '';
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
      // If AI didn't return valid JSON, try to extract content
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
