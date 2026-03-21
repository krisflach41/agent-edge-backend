// api/image-proxy.js
// Fetches an image from a URL and returns it as base64 data URL
// Used by Ad Builder to avoid CORS issues with Google Drive and Unsplash images

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  var imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ success: false, message: 'Missing url parameter' });
  }

  // Only allow image fetching from trusted domains
  var allowed = false;
  var trustedDomains = ['drive.google.com', 'lh3.googleusercontent.com', 'lh4.googleusercontent.com', 'lh5.googleusercontent.com', 'lh6.googleusercontent.com', 'googleusercontent.com', 'docs.google.com', 'images.unsplash.com', 'plus.unsplash.com'];
  try {
    var parsed = new URL(imageUrl);
    for (var i = 0; i < trustedDomains.length; i++) {
      if (parsed.hostname === trustedDomains[i] || parsed.hostname.endsWith('.' + trustedDomains[i])) {
        allowed = true;
        break;
      }
    }
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Invalid URL' });
  }

  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Domain not allowed' });
  }

  try {
    var response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, message: 'Failed to fetch image: ' + response.status });
    }

    var contentType = response.headers.get('content-type') || 'image/jpeg';
    // Make sure it's actually an image
    if (!contentType.startsWith('image/')) {
      contentType = 'image/jpeg';
    }

    var buffer = await response.arrayBuffer();
    var base64 = Buffer.from(buffer).toString('base64');
    var dataUrl = 'data:' + contentType + ';base64,' + base64;

    return res.status(200).json({ success: true, dataUrl: dataUrl });

  } catch (error) {
    console.error('Image proxy error:', error);
    return res.status(500).json({ success: false, message: 'Failed to proxy image' });
  }
}
