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
    const { name, email, brokerage, branding, cobrandLayout, notes, cart } = req.body;

    if (!name || !email || !cart) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Generate order ID
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    // Calculate item count
    let itemCount = 0;
    if (cart.marketing) itemCount += cart.marketing.length;
    if (cart.advisory) itemCount += Object.keys(cart.advisory).length;
    if (cart.websites) itemCount += cart.websites.length;

    // Determine co-branding
    const coBranding = branding === 'Co-branded';

    // Insert order into Supabase
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        order_id: orderId,
        user_email: email,
        user_name: name,
        brokerage: brokerage || null,
        items: cart,
        item_count: itemCount,
        co_branding: coBranding,
        co_brand_layout: coBranding ? (cobrandLayout || 'left') : null,
        notes: notes || null,
        status: 'new',
        cart_data: cart,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ success: false, message: 'Failed to submit order' });
    }

    // Track order in activity
    try {
      const orderSummary = [];
      if (cart.marketing && cart.marketing.length > 0) {
        orderSummary.push('Marketing: ' + cart.marketing.join(', '));
      }
      if (cart.advisory && Object.keys(cart.advisory).length > 0) {
        orderSummary.push('Reports: ' + Object.keys(cart.advisory).join(', '));
      }
      if (cart.websites && cart.websites.length > 0) {
        orderSummary.push('Websites: ' + cart.websites.length + ' properties');
      }

      await supabase
        .from('crm_activity')
        .insert([{
          crm_id: email,
          type: 'order_submitted',
          subject: 'Order Submitted',
          body: orderSummary.join(' | '),
          date: new Date().toISOString()
        }]);
    } catch (activityError) {
      console.error('Activity tracking failed:', activityError);
    }

    // SMS notification to Kristy
    try {
      await fetch('https://agent-edge-backend.vercel.app/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '+12063135883',
          message: 'Agent Edge: NEW ORDER\nFrom: ' + (name || email) + '\n' + orderSummary.join(', ')
        })
      });
    } catch (smsErr) { console.error('SMS notify error:', smsErr); }

    return res.status(200).json({ 
      success: true, 
      orderId: orderId,
      message: 'Order submitted successfully' 
    });

  } catch (error) {
    console.error('Order submission error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
