// /api/publish-site.js — Publish property website to Supabase Storage
// Uploads photos + final HTML, returns public URL
// To delete a site after sale: delete all files in media/property-sites/{slug}/

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

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
    const { slug, photos, html } = req.body;
    // slug = URL-safe folder name, e.g. "1111-raintree-drive"
    // photos = [{ base64: "data:image/jpeg;base64,...", role: "hero"|"gallery"|"parallax", index: 0 }]
    // html = the complete site HTML with PHOTO_PLACEHOLDER_0, PHOTO_PLACEHOLDER_1, etc.

    if (!slug || !html) {
      return res.status(400).json({ error: 'Missing slug or html' });
    }

    const basePath = `property-sites/${slug}`;
    const photoUrls = {};

    // Step 1: Upload each photo to Supabase Storage
    if (photos && photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo.base64 || !photo.base64.startsWith('data:')) continue;

        const match = photo.base64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (!match) continue;

        const mimeType = match[1];
        const fileBuffer = Buffer.from(match[2], 'base64');
        const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg');
        const photoPath = `${basePath}/photo-${i}.${ext}`;

        const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${photoPath}`, {
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
          console.error(`Photo ${i} upload failed:`, err);
          continue;
        }

        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${photoPath}`;
        photoUrls[`PHOTO_URL_${i}`] = publicUrl;
      }
    }

    // Step 2: Replace photo placeholders in HTML with real Supabase URLs
    let finalHtml = html;
    Object.keys(photoUrls).forEach(function(placeholder) {
      finalHtml = finalHtml.split(placeholder).join(photoUrls[placeholder]);
    });

    // Step 3: Upload the final HTML file
    const htmlPath = `${basePath}/index.html`;
    const htmlBuffer = Buffer.from(finalHtml, 'utf8');

    const htmlUploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${htmlPath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'text/html',
        'x-upsert': 'true'
      },
      body: htmlBuffer
    });

    if (!htmlUploadResp.ok) {
      const err = await htmlUploadResp.text();
      return res.status(500).json({ error: 'HTML upload failed', detail: err });
    }

    const siteUrl = `${SUPABASE_URL}/storage/v1/object/public/media/${htmlPath}`;

    return res.status(200).json({
      success: true,
      url: siteUrl,
      slug: slug,
      photosUploaded: Object.keys(photoUrls).length
    });

  } catch (err) {
    console.error('publish-site error:', err);
    return res.status(500).json({ error: 'Publish failed', detail: err.message });
  }
}
