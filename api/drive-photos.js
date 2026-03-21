// api/drive-photos.js
// Lists image files from a public Google Drive folder by scraping the folder page

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

  try {
    // Fetch the public folder page
    var folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
    var response = await fetch(folderUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(500).json({ success: false, message: 'Failed to fetch Drive folder' });
    }

    var html = await response.text();

    // Extract file IDs and names from the page HTML
    // Google Drive embeds file data in the page as JavaScript arrays
    // Pattern: file ID is a 33-character alphanumeric string that appears in specific data structures
    var photos = [];

    // Method 1: Look for data-id attributes on file entries
    var dataIdPattern = /data-id="([a-zA-Z0-9_-]{20,})"/g;
    var match;
    var seenIds = {};
    while ((match = dataIdPattern.exec(html)) !== null) {
      var fileId = match[1];
      if (fileId !== folderId && !seenIds[fileId]) {
        seenIds[fileId] = true;
        photos.push({
          id: fileId,
          thumb: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w300',
          full: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1250'
        });
      }
    }

    // Method 2: If data-id didn't work, try extracting from the JS data blobs
    if (photos.length === 0) {
      // Google Drive pages contain file IDs in various JS structures
      // Look for patterns like ["fileId","filename.jpg",...
      var jsPattern = /\["(1[a-zA-Z0-9_-]{30,})"(?:,|\])/g;
      while ((match = jsPattern.exec(html)) !== null) {
        var fid = match[1];
        if (fid !== folderId && !seenIds[fid] && fid.length < 50) {
          seenIds[fid] = true;
          photos.push({
            id: fid,
            thumb: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w300',
            full: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1250'
          });
        }
      }
    }

    // Method 3: Broader pattern for file IDs embedded in the page
    if (photos.length === 0) {
      var broadPattern = /\/d\/([a-zA-Z0-9_-]{25,})/g;
      while ((match = broadPattern.exec(html)) !== null) {
        var bid = match[1];
        if (bid !== folderId && !seenIds[bid]) {
          seenIds[bid] = true;
          photos.push({
            id: bid,
            thumb: 'https://drive.google.com/thumbnail?id=' + bid + '&sz=w300',
            full: 'https://drive.google.com/thumbnail?id=' + bid + '&sz=w1250'
          });
        }
      }
    }

    return res.status(200).json({ success: true, photos: photos, count: photos.length });

  } catch (error) {
    console.error('Drive photos error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load photos' });
  }
}
