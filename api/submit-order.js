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
    const { name, email, brokerage, branding, notes, cart } = req.body;

    if (!name || !email || !cart) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Build readable order summary
    let orderItems = [];
    
    if (cart.marketing && cart.marketing.length > 0) {
      cart.marketing.forEach(item => orderItems.push('Marketing: ' + item));
    }
    
    if (cart.advisory && Object.keys(cart.advisory).length > 0) {
      Object.keys(cart.advisory).forEach(reportType => {
        const props = cart.advisory[reportType];
        const displayName = getReportName(reportType);
        const addresses = props.map(p => p.address).join(', ');
        orderItems.push('Report: ' + displayName + ' (' + props.length + ' properties: ' + addresses + ')');
      });
    }
    
    if (cart.websites && cart.websites.length > 0) {
      cart.websites.forEach(w => orderItems.push('Website: ' + w.address));
    }

    const readableTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Generate order ID
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    // Send to Google Sheets Orders tab
    if (process.env.TRACKING_SHEETS_WEBHOOK) {
      await fetch(process.env.TRACKING_SHEETS_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          orderId: orderId,
          timestamp: readableTime,
          name: name,
          email: email,
          brokerage: brokerage,
          branding: branding || '',
          items: orderItems.join(' | '),
          itemCount: orderItems.length,
          notes: notes || '',
          status: 'New',
          cartJson: JSON.stringify(cart)
        })
      });
    }

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

function getReportName(type) {
  const names = {
    bid: 'Bid Over Ask',
    buyrent: 'Buy vs Rent',
    costwaiting: 'Cost of Waiting',
    appreciation: 'Appreciation',
    investment: 'Investment Property',
    amortization: 'Mortgage Amortization',
    reportcard: 'Real Estate Report Card'
  };
  return names[type] || type;
}
