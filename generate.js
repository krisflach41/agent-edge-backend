import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { topic, goal, platforms, tone, includes, length, userName, userEmail } = req.body;

    const timestamp = new Date().toISOString();

    // Log to Supabase activity table
    try {
      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: userEmail,
          type: 'ai_post_generated',
          subject: 'AI Post Generator',
          body: `Topic: ${topic} | Goal: ${goal} | Platforms: ${platforms.join(', ')} | Tone: ${tone} | Length: ${length}`,
          date: timestamp
        }]);
    } catch (activityError) {
      console.error('Activity logging failed:', activityError);
    }

    console.log('Post Generated:', { userName, userEmail, topic, goal, timestamp });

    const includesList = includes || [];
    const prompt = `You are writing a social media post AS Kristy Flach, a Certified Mortgage Advisor and Loan Officer at PRMG. Topic: ${topic}

KRISTY'S VOICE:
- Conversational, warm, real. Short sentences. Plain words. Like a smart, no-BS friend who happens to know everything about mortgages.
- Wicked dry humor — casual asides, not forced jokes. Never corny.
- She genuinely cares about people. She's a champion for underdogs.
- NOT a salesperson. Never pushy, never uses urgency tactics. Educates and lets people come to her.
- Call-to-action is always an open door, not a hard close.
- No corporate language: never say leverage, optimize, synergy, circle back, touch base, reach out, or "I'd love to connect."
- No salesy phrases: never say limited time, act now, don't miss, exclusive offer.
- Contractions always. OK to start sentences with And, But, or So.
- Honest to a fault. Never fabricate stories or statistics.

Post requirements:
- Goal: ${goal}
- Platforms: ${platforms.join(', ')}
- Length: ${length}
- Write in first person as Kristy
- Keep it authentic — it should sound like a real person posted this, not a marketing department

${includesList.includes('hashtags') ? 'Include 5-7 relevant hashtags at the end.' : ''}
${includesList.includes('emoji') ? 'Use emojis sparingly — 1-2 max, not on every line.' : ''}
${includesList.includes('cta') ? 'Include a soft, low-pressure call-to-action.' : ''}
${includesList.includes('question') ? 'Include an engaging question to drive comments.' : ''}

Format the post exactly as it should appear on social media, with proper line breaks and spacing.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
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

    return res.status(200).json({
      success: true,
      post: generatedPost,
      metadata: {
        userName,
        userEmail,
        topic,
        timestamp
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
