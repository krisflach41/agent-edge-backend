// /api/cron-drips.js — Called daily by Vercel cron to process drip campaigns

export default async function handler(req, res) {
  try {
    var response = await fetch('https://agent-edge-backend.vercel.app/api/email-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process_drips' })
    });
    var data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
