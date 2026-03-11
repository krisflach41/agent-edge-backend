// /api/publish-site.js — Publish property website HTML to Supabase Storage
// Photos are uploaded separately via /api/upload-image
// This endpoint only uploads the final HTML and returns the public URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  try {
    const { slug, html } = req.body;

    if (!slug || !html) {
      return res.status(400).json({ error: 'Missing slug or html' });
    }

    // Upload the HTML file to Supabase Storage
    const htmlPath = `property-sites/${slug}/index.html`;
    const htmlBuffer = Buffer.from(html, 'utf8');

    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${htmlPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'text/html',
        'x-upsert': 'true'
      },
      body: htmlBuffer
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return res.status(500).json({ error: 'HTML upload failed', detail: err });
    }

    const siteUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${htmlPath}`;

    return res.status(200).json({
      success: true,
      url: siteUrl,
      slug: slug
    });

  } catch (err) {
    console.error('publish-site error:', err);
    return res.status(500).json({ error: 'Publish failed', detail: err.message });
  }
}
