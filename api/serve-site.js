// /api/serve-site.js — Serve published property websites
// URL: /api/serve-site?slug=1111-raintree-dr-milford
// Reads HTML from property_sites table and serves it as a rendered webpage

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Allow GET requests from any origin (these are public websites)
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).send('Server configuration error');
  }

  try {
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).send('Missing site identifier');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('property_sites')
      .select('html')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      return res.status(404).send('<html><body style="font-family:sans-serif;text-align:center;padding:80px;"><h1>Site Not Found</h1><p>This property website is no longer available.</p></body></html>');
    }

    // Serve the HTML with correct content type
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(data.html);

  } catch (err) {
    console.error('serve-site error:', err);
    return res.status(500).send('Server error');
  }
}
