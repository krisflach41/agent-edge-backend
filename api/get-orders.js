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
    // Fetch from Google Sheets using the public visualization API
    var sheetId = '1GTJy_IilOPiGNaJ3YxRS8UnY5iBZPiHpF2Nhbt0Zt4A';
    var url = 'https://docs.google.com/spreadsheets/d/' + sheetId + '/gviz/tq?tqx=out:json&sheet=Orders';
    
    var response = await fetch(url);
    var text = await response.text();
    
    // Parse Google Sheets JSON response
    var jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
    if (!jsonStr) {
      return res.status(200).json({ success: true, orders: [] });
    }
    
    var json = JSON.parse(jsonStr[1]);
    var rows = json.table.rows;
    
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: true, orders: [] });
    }
    
    var orders = rows.map(function(row) {
      return {
        orderId: (row.c[0] && row.c[0].v) || '',
        timestamp: (row.c[1] && row.c[1].v) || '',
        name: (row.c[2] && row.c[2].v) || '',
        email: (row.c[3] && row.c[3].v) || '',
        brokerage: (row.c[4] && row.c[4].v) || '',
        branding: (row.c[5] && row.c[5].v) || '',
        items: (row.c[6] && row.c[6].v) || '',
        itemCount: (row.c[7] && row.c[7].v) || 0,
        notes: (row.c[8] && row.c[8].v) || '',
        status: (row.c[9] && row.c[9].v) || 'New',
        cartJson: (row.c[10] && row.c[10].v) || ''
      };
    }).filter(function(order) {
      return order.orderId && order.orderId !== 'Order ID';
    });
    
    // Newest first
    orders.reverse();
    
    return res.status(200).json({ success: true, orders: orders });

  } catch (error) {
    console.error('Fetch orders error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
}
