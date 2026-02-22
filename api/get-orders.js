import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all orders from Supabase, newest first
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase fetch error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }

    // Transform to match the expected format
    const orders = (data || []).map(order => ({
      orderId: order.order_id || '',
      timestamp: order.created_at || '',
      name: order.user_name || '',
      email: order.user_email || '',
      brokerage: order.brokerage || '',
      branding: order.co_branding ? 'Co-branded' : 'Kristy-branded only',
      cobrandLayout: order.co_brand_layout || 'left',
      items: order.items ? JSON.stringify(order.items) : '',
      itemCount: order.item_count || 0,
      notes: order.notes || '',
      status: order.status || 'new',
      cartJson: order.cart_data ? JSON.stringify(order.cart_data) : ''
    }));
    
    return res.status(200).json({ success: true, orders: orders });

  } catch (error) {
    console.error('Fetch orders error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
}
