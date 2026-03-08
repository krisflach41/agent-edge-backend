// /api/upload-image.js — Upload image to Supabase Storage
// Accepts both FormData (file upload) and JSON (base64 data URL)

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
    // Read raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    let fileBuffer, mimeType, safeName;
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart manually — find the file boundary
      const boundary = contentType.split('boundary=')[1];
      if (!boundary) return res.status(400).json({ error: 'No boundary in multipart' });

      const bodyStr = rawBody.toString('latin1');
      const parts = bodyStr.split('--' + boundary);

      let filePart = null;
      for (const part of parts) {
        if (part.includes('filename=')) {
          filePart = part;
          break;
        }
      }

      if (!filePart) return res.status(400).json({ error: 'No file found in upload' });

      // Extract content type from part headers
      const ctMatch = filePart.match(/Content-Type:\s*(.+?)[\r\n]/i);
      mimeType = ctMatch ? ctMatch[1].trim() : 'image/jpeg';

      // Extract filename
      const fnMatch = filePart.match(/filename="(.+?)"/);
      safeName = fnMatch ? fnMatch[1].replace(/[^a-z0-9.]/gi, '-').toLowerCase() : 'post-image';

      // File data starts after double newline in the part
      const headerEnd = filePart.indexOf('\r\n\r\n');
      if (headerEnd === -1) return res.status(400).json({ error: 'Malformed multipart data' });

      // Get the byte offset in the raw buffer
      const partStart = rawBody.indexOf(Buffer.from(filePart.substring(0, 40), 'latin1'));
      const dataStart = partStart + headerEnd + 4;

      // Find end of this part (before next boundary)
      const endBoundary = Buffer.from('\r\n--' + boundary, 'latin1');
      let dataEnd = rawBody.indexOf(endBoundary, dataStart);
      if (dataEnd === -1) dataEnd = rawBody.length;

      fileBuffer = rawBody.slice(dataStart, dataEnd);

    } else {
      // JSON body with base64
      const body = JSON.parse(rawBody.toString('utf8'));
      const image = body.image;
      const filename = body.filename || 'post-image';

      if (!image) return res.status(400).json({ error: 'No image provided' });

      // If already a URL, pass through
      if (image.startsWith('http')) {
        return res.status(200).json({ success: true, url: image });
      }

      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: 'Invalid base64 data URL' });

      mimeType = match[1];
      fileBuffer = Buffer.from(match[2], 'base64');
      safeName = filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    }

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
    const storagePath = `social/${Date.now()}-${safeName.replace(/\.\w+$/, '')}.${ext}`;

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
    return res.status(200).json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('upload-image error:', err);
    return res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
}
