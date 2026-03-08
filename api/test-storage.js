// /api/test-storage.js — Quick test to verify Supabase Storage upload works

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env vars', hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_SERVICE_KEY });
  }

  try {
    // Create a tiny 1x1 pixel PNG
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const storagePath = `social/test-${Date.now()}.png`;
    const url = `${SUPABASE_URL}/storage/v1/object/media/${storagePath}`;

    const uploadResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true'
      },
      body: pngBytes
    });

    const status = uploadResp.status;
    const responseText = await uploadResp.text();

    if (uploadResp.ok) {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${storagePath}`;
      return res.status(200).json({ 
        success: true, 
        message: 'Upload worked!', 
        publicUrl,
        supabaseStatus: status,
        supabaseResponse: responseText
      });
    } else {
      return res.status(200).json({ 
        success: false, 
        message: 'Upload failed',
        supabaseStatus: status,
        supabaseResponse: responseText,
        urlUsed: url.replace(SUPABASE_SERVICE_KEY, '***')
      });
    }
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
