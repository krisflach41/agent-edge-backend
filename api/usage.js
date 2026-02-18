import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ===== GET: Retrieve usage counts for a user =====
  if (req.method === 'GET') {
    try {
      const email = (req.query.email || '').toLowerCase().trim();
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
      }

      const { data, error } = await supabase
        .from('usage_counts')
        .select('tool_key, count')
        .eq('email', email);

      if (error) {
        console.error('Usage fetch error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch usage' });
      }

      // Convert rows to object: { "grab-and-go": 3, "on-demand": 1 }
      const counts = {};
      if (data) {
        data.forEach(function(row) {
          counts[row.tool_key] = row.count;
        });
      }

      return res.status(200).json({ success: true, counts: counts });

    } catch (error) {
      console.error('Usage GET error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // ===== POST: Increment usage count =====
  if (req.method === 'POST') {
    try {
      const { email, toolKey } = req.body;

      if (!email || !toolKey) {
        return res.status(400).json({ success: false, message: 'Email and toolKey required' });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Try to get existing count
      const { data: existing } = await supabase
        .from('usage_counts')
        .select('count')
        .eq('email', cleanEmail)
        .eq('tool_key', toolKey)
        .single();

      let newCount;

      if (existing) {
        // Update existing
        newCount = existing.count + 1;
        const { error } = await supabase
          .from('usage_counts')
          .update({ count: newCount, updated_at: new Date().toISOString() })
          .eq('email', cleanEmail)
          .eq('tool_key', toolKey);

        if (error) {
          console.error('Usage update error:', error);
          return res.status(500).json({ success: false, message: 'Failed to update usage' });
        }
      } else {
        // Insert new
        newCount = 1;
        const { error } = await supabase
          .from('usage_counts')
          .insert([{
            email: cleanEmail,
            tool_key: toolKey,
            count: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);

        if (error) {
          console.error('Usage insert error:', error);
          return res.status(500).json({ success: false, message: 'Failed to record usage' });
        }
      }

      return res.status(200).json({ success: true, count: newCount });

    } catch (error) {
      console.error('Usage POST error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
