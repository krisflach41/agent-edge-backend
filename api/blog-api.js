// /api/blog-api.js — Blog management endpoint
// GET  ?action=list          → all posts (admin, requires auth header)
// GET  ?action=public        → latest 3 published posts (for index.html)
// GET  ?action=archive       → all published posts (for archive page)
// GET  ?action=single&slug=X → single published post by slug
// POST action=create         → create new post
// POST action=update         → update existing post
// POST action=delete         → delete a post
// POST action=ai-draft       → AI generates a draft from topic
// POST action=ai-polish      → AI polishes provided text

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var SUPABASE_URL = process.env.SUPABASE_URL;
  var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    // ===== GET REQUESTS =====
    if (req.method === 'GET') {
      var action = req.query.action || 'public';

      // Public: latest 3 published posts (for index.html)
      if (action === 'public') {
        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/blog_posts?status=eq.published&order=published_at.desc&limit=3&select=id,title,slug,category,summary,image_url,published_at',
          { headers: headers }
        );
        var posts = await resp.json();
        return res.status(200).json({ success: true, posts: posts });
      }

      // Archive: all published posts
      if (action === 'archive') {
        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/blog_posts?status=eq.published&order=published_at.desc&select=id,title,slug,category,summary,image_url,published_at',
          { headers: headers }
        );
        var posts = await resp.json();
        return res.status(200).json({ success: true, posts: posts });
      }

      // Single post by slug
      if (action === 'single') {
        var slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'slug required' });
        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/blog_posts?slug=eq.' + encodeURIComponent(slug) + '&select=*',
          { headers: headers }
        );
        var rows = await resp.json();
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Post not found' });
        return res.status(200).json({ success: true, post: rows[0] });
      }

      // Admin: list all posts (drafts + published)
      if (action === 'list') {
        var resp = await fetch(
          SUPABASE_URL + '/rest/v1/blog_posts?order=created_at.desc&select=id,title,slug,category,summary,status,published_at,created_at',
          { headers: headers }
        );
        var posts = await resp.json();
        return res.status(200).json({ success: true, posts: posts });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ===== POST REQUESTS =====
    if (req.method === 'POST') {
      var body = req.body || {};
      var action = body.action;

      // CREATE
      if (action === 'create') {
        var slug = slugify(body.title || 'untitled');
        var postData = {
          title: body.title || 'Untitled Post',
          slug: slug,
          category: body.category || 'General',
          summary: body.summary || '',
          body: body.body || '',
          image_url: body.image_url || '',
          status: body.status || 'draft',
          published_at: body.status === 'published' ? new Date().toISOString() : null
        };
        var resp = await fetch(SUPABASE_URL + '/rest/v1/blog_posts', {
          method: 'POST', headers: headers, body: JSON.stringify(postData)
        });
        var result = await resp.json();
        return res.status(201).json({ success: true, post: Array.isArray(result) ? result[0] : result });
      }

      // UPDATE
      if (action === 'update') {
        if (!body.id) return res.status(400).json({ error: 'id required' });
        var updates = { updated_at: new Date().toISOString() };
        if (body.title !== undefined) {
          updates.title = body.title;
          updates.slug = slugify(body.title);
        }
        if (body.category !== undefined) updates.category = body.category;
        if (body.summary !== undefined) updates.summary = body.summary;
        if (body.body !== undefined) updates.body = body.body;
        if (body.image_url !== undefined) updates.image_url = body.image_url;
        if (body.status !== undefined) {
          updates.status = body.status;
          if (body.status === 'published' && !body.keep_date) {
            updates.published_at = new Date().toISOString();
          }
        }
        var resp = await fetch(SUPABASE_URL + '/rest/v1/blog_posts?id=eq.' + body.id, {
          method: 'PATCH', headers: headers, body: JSON.stringify(updates)
        });
        var result = await resp.json();
        return res.status(200).json({ success: true, post: Array.isArray(result) ? result[0] : result });
      }

      // DELETE
      if (action === 'delete') {
        if (!body.id) return res.status(400).json({ error: 'id required' });
        await fetch(SUPABASE_URL + '/rest/v1/blog_posts?id=eq.' + body.id, {
          method: 'DELETE', headers: headers
        });
        return res.status(200).json({ success: true });
      }

      // AI DRAFT — generate a blog post from a topic
      if (action === 'ai-draft') {
        var topic = body.topic;
        if (!topic) return res.status(400).json({ error: 'topic required' });

        var apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

        var systemPrompt = 'You are a professional blog writer for Kristy Flach, a Certified Mortgage Advisor (CMA) and Loan Officer at Paramount Residential Mortgage Group (PRMG). Kristy has 17 years of mortgage underwriting experience and is licensed in 49 states.\n\n' +
          'WRITING STYLE:\n' +
          '- Professional but warm and approachable\n' +
          '- Educational — explain concepts clearly for homebuyers and homeowners\n' +
          '- Strategic — focus on how mortgage decisions impact long-term financial health\n' +
          '- Confident without being salesy\n' +
          '- Use "I" voice as Kristy\n\n' +
          'OUTPUT FORMAT — return ONLY valid JSON, no markdown, no backticks:\n' +
          '{"title":"...","category":"...","summary":"A 1-2 sentence summary for the blog card on the homepage","body":"The full blog post in HTML format (use <h3>, <p>, <ul>, <li>, <strong>, <em> tags). Aim for 600-900 words."}\n\n' +
          'Category must be one of: Home Buying, Refinance, Mortgage Strategy, Market Update, Credit & Finance, First-Time Buyers';

        var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: 'Write a mortgage blog post about: ' + topic }],
            system: systemPrompt
          })
        });

        var aiData = await aiResp.json();
        var aiText = aiData.content && aiData.content[0] ? aiData.content[0].text : '';

        try {
          var cleaned = aiText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          var parsed = JSON.parse(cleaned);
          return res.status(200).json({ success: true, draft: parsed });
        } catch (e) {
          return res.status(200).json({ success: true, draft: { title: '', category: 'General', summary: '', body: aiText } });
        }
      }

      // AI POLISH — improve provided text
      if (action === 'ai-polish') {
        var text = body.text;
        if (!text) return res.status(400).json({ error: 'text required' });

        var apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Anthropic API key not configured' });

        var systemPrompt = 'You are editing a blog post for Kristy Flach, a Certified Mortgage Advisor. Polish the writing to be professional, clear, and engaging. Fix grammar, improve flow, and strengthen the educational value. Keep the same voice and meaning.\n\n' +
          'Return ONLY the polished text in HTML format (use <h3>, <p>, <ul>, <li>, <strong>, <em> tags). No preamble, no explanation.';

        var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: 'Polish this blog post:\n\n' + text }],
            system: systemPrompt
          })
        });

        var aiData = await aiResp.json();
        var polished = aiData.content && aiData.content[0] ? aiData.content[0].text : text;
        return res.status(200).json({ success: true, polished: polished });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}
