// /api/delete-site.js — Delete a published property website and its photos
// Removes all files in media/property-sites/{slug}/

import { createClient } from '@supabase/supabase-js';

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
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ error: 'Missing slug' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const folderPath = `property-sites/${slug}`;

    // List all files in the folder
    const { data: files, error: listError } = await supabase.storage
      .from('media')
      .list(folderPath);

    if (listError) {
      return res.status(500).json({ error: 'Failed to list files', detail: listError.message });
    }

    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'No files found for this property site' });
    }

    // Build array of full paths to delete
    const filePaths = files.map(f => `${folderPath}/${f.name}`);

    // Delete all files
    const { error: deleteError } = await supabase.storage
      .from('media')
      .remove(filePaths);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to delete files', detail: deleteError.message });
    }

    return res.status(200).json({
      success: true,
      slug: slug,
      filesDeleted: filePaths.length
    });

  } catch (err) {
    console.error('delete-site error:', err);
    return res.status(500).json({ error: 'Delete failed', detail: err.message });
  }
}
