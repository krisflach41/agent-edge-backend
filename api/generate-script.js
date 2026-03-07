// /api/generate-script.js — delegates to central ai-api
// Kept for backwards compatibility with media-lab.html calls

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, format, audience, type } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  let payload = {};
  if (type === 'hashtags') {
    payload = { action: 'social-hashtags', caption: topic };
  } else if (type === 'caption') {
    payload = { action: 'social-caption', draft: topic, platforms: audience };
  } else if (type === 'rewrite') {
    payload = { action: 'video-rewrite', script: topic, instructions: format };
  } else {
    payload = { action: 'video-script', topic, format, audience, tone };
  }

  try {
    const resp = await fetch('https://agent-edge-backend.vercel.app/api/ai-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!data.success) return res.status(500).json({ error: data.error || 'AI request failed' });
    return res.status(200).json({ success: true, script: data.result });
  } catch (err) {
    return res.status(500).json({ error: 'Request failed', detail: err.message });
  }
}
