// /api/cron-rollup.js — Called nightly by Vercel cron to build tracking rollups

export default async function handler(req, res) {
  try {
    var response = await fetch('https://agent-edge-backend.vercel.app/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'build_rollup' })
    });
    var data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
