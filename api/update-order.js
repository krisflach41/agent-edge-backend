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
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({ success: false, message: 'Missing orderId or status' });
    }

    // Update order status in Supabase
    const { data, error } = await supabase
      .from('orders')
      .update({ 
        status: status.toLowerCase(),
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .select();

    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update order status' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    return res.status(200).json({ success: true, message: 'Status updated' });

  } catch (error) {
    console.error('Update status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
