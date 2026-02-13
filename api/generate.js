export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { topic, goal, platforms, tone, includes, length, userName, userEmail } = req.body;

    // Create timestamp
    const timestamp = new Date().toISOString();
    const readableTime = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Log to Google Sheets (if configured)
    if (process.env.GOOGLE_SHEETS_WEBHOOK) {
      try {
        await fetch(process.env.GOOGLE_SHEETS_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName,
            userEmail,
            topic,
            goal,
            platforms: platforms.join(', '),
            tone,
            length,
            timestamp: readableTime
          })
        });
      } catch (sheetError) {
        console.error('Google Sheets logging failed:', sheetError);
        // Don't fail the request if logging fails
      }
    }

    // Log to console (always)
    console.log('Post Generated:', { userName, userEmail, topic, goal, timestamp: readableTime });

    // Build the prompt for Claude
    const includesList = includes || [];
    const prompt = `You are a professional real estate social media content creator. Create a ${tone} social media post about: ${topic}

Post requirements:
- Goal: ${goal}
- Platforms: ${platforms.join(', ')}
- Length: ${length}
- Voice: Trusted local real estate expert (NOT mortgage lender - this is for realtors)
- Keep it authentic and engaging
- Make it ready to copy and paste

${includesList.includes('hashtags') ? 'Include 5-7 relevant hashtags at the end.' : ''}
${includesList.includes('emoji') ? 'Use emojis appropriately throughout.' : ''}
${includesList.includes('cta') ? 'Include a clear call-to-action.' : ''}
${includesList.includes('question') ? 'Include an engaging question to drive comments.' : ''}

Format the post exactly as it should appear on social media, with proper line breaks and spacing.`;

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    const generatedPost = data.content.find(block => block.type === 'text')?.text || '';

    // Return the generated post
    return res.status(200).json({
      success: true,
      post: generatedPost,
      metadata: {
        userName,
        userEmail,
        topic,
        timestamp: readableTime
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to generate post',
      message: error.message 
    });
  }
}
