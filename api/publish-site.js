// /api/publish-site.js — Save property website HTML to database
// Photos are uploaded separately via /api/upload-image
// HTML is stored in property_sites table and served via /api/serve-site

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
    const { slug, html, address, agent, template } = req.body;

    if (!slug || !html) {
      return res.status(400).json({ error: 'Missing slug or html' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Upsert — insert new or update existing site with same slug
    const { error } = await supabase
      .from('property_sites')
      .upsert({
        slug: slug,
        html: html,
        address: address || '',
        agent: agent || '',
        template: template || '',
        updated_at: new Date().toISOString()
      }, { onConflict: 'slug' });

    if (error) {
      return res.status(500).json({ error: 'Database save failed', detail: error.message });
    }

    // Build the live URL
    const siteUrl = 'https://agent-edge-backend.vercel.app/api/serve-site?slug=' + encodeURIComponent(slug);

    return res.status(200).json({
      success: true,
      url: siteUrl,
      slug: slug
    });

  } catch (err) {
    console.error('publish-site error:', err);
    return res.status(500).json({ error: 'Publish failed', detail: err.message });
  }
}
