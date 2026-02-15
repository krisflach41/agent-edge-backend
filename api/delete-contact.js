export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    var webhookUrl = process.env.TRACKING_SHEETS_WEBHOOK;
    if (!webhookUrl) {
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    var response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'deleteContact',
        contactId: req.body.contactId
      })
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Delete contact error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete contact' });
  }
}
