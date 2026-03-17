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

    var systemPrompt = 'You are an email copywriter for Kristy Flach, a mortgage loan officer. You write emails that go to real estate agents (realtors) and clients.\n\n' +
      'RULES:\n' +
      '- Write the email body ONLY — do NOT include any greeting like "Hi" or "Hello" at the start (the greeting is added separately)\n' +
      '- Do NOT include a sign-off like "Best regards, Kristy" (signature is added automatically)\n' +
      '- Output clean HTML using <p> tags for paragraphs\n' +
      '- Keep it concise: 3-5 short paragraphs max\n' +
      '- Tone: ' + (tone || 'warm and professional') + '\n' +
      '- Use simple, genuine language — never salesy or pushy\n' +
      '- Include a soft call-to-action where appropriate\n' +
      '- Do NOT include subject line in the body\n\n' +
      'Also provide a short, compelling subject line.\n\n' +
      'You MUST respond in this exact JSON format with no other text, no markdown, no backticks:\n' +
      '{"subject": "Your subject line here", "body_html": "<p>First paragraph</p><p>Second paragraph</p>"}';

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
      // If AI didn't return valid JSON, wrap as HTML
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
