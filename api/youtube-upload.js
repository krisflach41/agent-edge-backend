// /api/youtube-upload.js — Upload video to YouTube via YouTube Data API v3
// POST multipart/form-data: file, title, description, category, privacy

import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const YT_ACCESS_TOKEN = process.env.YT_ACCESS_TOKEN;

  if (!YT_ACCESS_TOKEN) {
    return res.status(500).json({
      error: 'YouTube not configured',
      message: 'Add YT_ACCESS_TOKEN to Vercel environment variables. Generate via Google OAuth 2.0 with youtube.upload scope.'
    });
  }

  try {
    const form = new IncomingForm({ maxFileSize: 2 * 1024 * 1024 * 1024 });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const title = Array.isArray(fields.title) ? fields.title[0] : fields.title || 'Untitled';
    const description = Array.isArray(fields.description) ? fields.description[0] : fields.description || '';
    const privacy = Array.isArray(fields.privacy) ? fields.privacy[0] : fields.privacy || 'public';

    const fileBuffer = fs.readFileSync(file.filepath);
    const mimeType = file.mimetype || 'video/mp4';

    // Step 1: Initialize resumable upload
    const initResp = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${YT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': fileBuffer.length
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          categoryId: '27' // Education category
        },
        status: {
          privacyStatus: privacy
        }
      })
    });

    if (!initResp.ok) {
      const err = await initResp.text();
      return res.status(500).json({ error: 'YouTube init failed', detail: err });
    }

    const uploadUrl = initResp.headers.get('location');
    if (!uploadUrl) return res.status(500).json({ error: 'No upload URL returned from YouTube' });

    // Step 2: Upload video bytes
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length
      },
      body: fileBuffer
    });

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      return res.status(500).json({ error: 'YouTube upload failed', detail: err });
    }

    const uploadData = await uploadResp.json();
    const videoId = uploadData.id;

    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      success: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}`
    });

  } catch (err) {
    console.error('youtube-upload error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
}
