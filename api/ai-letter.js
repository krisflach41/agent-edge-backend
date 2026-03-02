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
    var { prompt, borrowerName, letterType } = req.body;
    if (!prompt) return res.status(400).json({ success: false, message: 'prompt required' });

    var apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ success: false, message: 'Anthropic API key not configured' });

    var systemPrompt = 'You are a professional credit repair letter writer working for a mortgage loan officer. You write letters on behalf of borrowers who are working to improve their credit scores in preparation for a mortgage.\n\n' +
      'RULES:\n' +
      '- Write ONLY the letter text, ready to print. No preamble, no explanation, no markdown.\n' +
      '- Include today\'s date at the top.\n' +
      '- Use [BRACKETS] for any information the borrower needs to fill in (address, account number, SSN last 4, etc.)\n' +
      '- Be professional, clear, and appropriately firm (for disputes) or sincere (for goodwill letters).\n' +
      '- For dispute letters: cite the Fair Credit Reporting Act (FCRA) Section 611 and request validation within 30 days.\n' +
      '- For goodwill letters: be humble and appreciative, mention the borrower is pursuing homeownership.\n' +
      '- For pay-for-delete letters: make the offer CONDITIONAL on written agreement to remove the tradeline from all three bureaus. Include a signature block for the creditor.\n' +
      '- Never be threatening or hostile.\n' +
      '- Keep letters to one page when possible.\n' +
      '- Do not include any text outside the letter itself.\n';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
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
    // Clean up any markdown fencing that might sneak in
    text = text.replace(/```\s*/g, '').trim();

    return res.status(200).json({
      success: true,
      letter: text,
      letterType: letterType || 'unknown'
    });

  } catch (err) {
    console.error('AI letter error:', err);
    return res.status(500).json({ success: false, message: 'Server error generating letter' });
  }
}
