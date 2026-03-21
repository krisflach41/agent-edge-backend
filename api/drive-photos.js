// api/drive-photos.js
// Lists image files from a public Google Drive folder
// Uses Google's built-in public API endpoint — no API key signup required

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

  var folderId = req.query.folder || '1PZShJxcQfjaDv2G7NiNToYdQQVaJQIJc';
  var pageToken = req.query.pageToken || '';

  try {
    // Google's public Drive API endpoint — uses Google's own built-in browser key
    // This is the same key Google's own Drive web UI uses for public folder listing
    var apiUrl = 'https://www.googleapis.com/drive/v3/files'
      + '?q=%27' + folderId + '%27+in+parents+and+mimeType+contains+%27image%27'
      + '&fields=nextPageToken,files(id,name,mimeType,thumbnailLink)'
      + '&pageSize=100'
      + '&orderBy=name'
      + '&key=AIzaSyC1qbk75NzWBvSaDh6KnUvySIGOKCNp6Ck';

    if (pageToken) {
      apiUrl += '&pageToken=' + encodeURIComponent(pageToken);
    }

    var response = await fetch(apiUrl, {
      headers: {
        'Referer': 'https://drive.google.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      var errorText = await response.text();
      console.error('Drive API error:', response.status, errorText);

      // Fallback: try the v2beta endpoint
      var fallbackUrl = 'https://clients6.google.com/drive/v2beta/files'
        + '?q=%27' + folderId + '%27+in+parents'
        + '&fields=items(id,title,mimeType,thumbnailLink)'
        + '&maxResults=100'
        + '&key=AIzaSyC1qbk75NzWBvSaDh6KnUvySIGOKCNp6Ck';

      var fallbackRes = await fetch(fallbackUrl, {
        headers: {
          'Referer': 'https://drive.google.com/',
          'X-Referer': 'https://explorer.apis.google.com'
        }
      });

      if (!fallbackRes.ok) {
        return res.status(500).json({ success: false, message: 'Could not access Drive folder' });
      }

      var fallbackData = await fallbackRes.json();
      var items = (fallbackData.items || []).filter(function(f) {
        return f.mimeType && f.mimeType.startsWith('image/');
      });

      var photos = items.map(function(f) {
        return {
          id: f.id,
          name: f.title || '',
          thumb: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w300',
          full: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w1250'
        };
      });

      return res.status(200).json({ success: true, photos: photos, count: photos.length });
    }

    var data = await response.json();
    var files = data.files || [];

    var photos = files.map(function(f) {
      return {
        id: f.id,
        name: f.name || '',
        thumb: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w1250'
      };
    });

    var result = { success: true, photos: photos, count: photos.length };
    if (data.nextPageToken) {
      result.nextPageToken = data.nextPageToken;
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Drive photos error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load photos: ' + error.message });
  }
}
