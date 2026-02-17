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
    const { userName, userEmail, action, details, currentScore, projectedScore, timestamp } = req.body;

    // Log to Supabase credit_simulator_logs table
    try {
      await supabase
        .from('credit_simulator_logs')
        .insert([{
          log_type: 'SIMULATION',
          user_name: userName,
          user_email: userEmail,
          action: action,
          details: details ? details.substring(0, 200) : null,
          current_score: currentScore || null,
          projected_score: projectedScore ? `${projectedScore.min}-${projectedScore.max}` : null,
          created_at: new Date().toISOString()
        }]);
    } catch (logError) {
      console.error('Supabase logging failed:', logError);
    }

    console.log('Simulator Usage Logged:', { userName, action });

    return res.status(200).json({
      success: true,
      message: 'Usage logged'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Logging failed',
      message: error.message 
    });
  }
}
