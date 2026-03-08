// /api/upload-image.js — Upload base64 image to Supabase Storage, return public URL
// POST JSON: { image: "data:image/jpeg;base64,...", filename: "optional-name" }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    const { image, filename } = req.body;

    if (!image) return res.status(400).json({ error: 'image (base64 data URL) required' });

    // Parse the data URL: data:image/jpeg;base64,/9j/4AAQ...
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      // If it's already a URL (not base64), just pass it back
      if (image.startsWith('http')) {
        return res.status(200).json({ success: true, url: image });
      }
      return res.status(400).json({ error: 'Invalid image format. Expected base64 data URL or http URL.' });
    }

    const mimeType = match[1]; // e.g. image/jpeg
    const base64Data = match[2];
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1]; // jpg, png, gif, webp

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate filename
    const safeName = filename
      ? filename.replace(/[^a-z0-9]/gi, '-').toLowerCase()
      : 'post-image';
    const storagePath = `social/${Date.now()}-${safeName}.${ext}`;

    // Upload to Supabase Storage bucket "media"
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: buffer
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return res.status(500).json({ error: 'Supabase upload failed', detail: err });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;

    return res.status(200).json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('upload-image error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
}
