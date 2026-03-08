// /api/upload-image.js — Upload image file to Supabase Storage via FormData
// POST multipart/form-data: file (image), filename (optional)

import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

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
    const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 }); // 20MB

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const filename = Array.isArray(fields.filename) ? fields.filename[0] : fields.filename || 'post-image';

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.filepath);
    const mimeType = file.mimetype || 'image/jpeg';
    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
    const safeName = filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const storagePath = `social/${Date.now()}-${safeName}.${ext}`;

    // Upload to Supabase Storage bucket "media"
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: fileBuffer
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return res.status(500).json({ error: 'Supabase upload failed', detail: err });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;

    // Clean up temp file
    try { fs.unlinkSync(file.filepath); } catch(e) {}

    return res.status(200).json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('upload-image error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
}
