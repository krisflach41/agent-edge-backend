// /api/upload-video.js — Upload video to Supabase Storage
// POST multipart/form-data: file, title, category, description, visibility

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
    const form = new IncomingForm({ maxFileSize: 2 * 1024 * 1024 * 1024 }); // 2GB

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const title = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Untitled';
    const category = Array.isArray(fields.category) ? fields.category[0] : fields.category || 'General';
    const description = Array.isArray(fields.description) ? fields.description[0] : fields.description || '';
    const visibility = Array.isArray(fields.visibility) ? fields.visibility[0] : fields.visibility || 'both';

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.filepath);
    const ext = file.originalFilename ? file.originalFilename.split('.').pop() : 'mp4';
    const fileName = `videos/${Date.now()}-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.${ext}`;

    // Upload to Supabase Storage bucket "media"
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${fileName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': file.mimetype || 'video/mp4',
        'x-upsert': 'true'
      },
      body: fileBuffer
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return res.status(500).json({ error: 'Supabase upload failed', detail: err });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${fileName}`;

    // Save record to media_library table
    const record = {
      title,
      category,
      description,
      visibility,
      file_url: publicUrl,
      file_name: fileName,
      type: 'video',
      created_at: new Date().toISOString()
    };

    await fetch(`${SUPABASE_URL}/rest/v1/media_library`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.status(200).json({ success: true, url: publicUrl, fileName });

  } catch (err) {
    console.error('upload-video error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
}
