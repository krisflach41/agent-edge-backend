// api/image-search.js
// Unsplash image search proxy for Agent Edge Portal

export default async function handler(req, res) {
  // CORS
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

  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ success: false, message: 'Missing query parameter' });
  }

  try {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=9&orientation=squarish`,
      {
        headers: {
          'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      return res.status(200).json({ success: true, images: [] });
    }

    const images = data.results.map(function(photo) {
      return {
        id: photo.id,
        thumb: photo.urls.small,
        regular: photo.urls.regular,
        alt: photo.alt_description || '',
        photographer: photo.user.name,
        photographerUrl: photo.user.links.html
      };
    });

    return res.status(200).json({ success: true, images: images });

  } catch (error) {
    console.error('Unsplash API error:', error);
    return res.status(500).json({ success: false, message: 'Image search failed' });
  }
}
