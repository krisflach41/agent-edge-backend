// /api/social-publish.js — Publish text/image posts to social platforms
// POST JSON: { action, caption, platforms, photo, scheduledFor }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  const { caption, platforms, photo, scheduledFor } = body;

  if (!caption) return res.status(400).json({ error: 'caption required' });
  if (!platforms || !platforms.length) return res.status(400).json({ error: 'platforms required' });

  const results = {};
  const errors = {};

  // ---- FACEBOOK ----
  if (platforms.includes('facebook')) {
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
    const FB_PAGE_ID = process.env.FB_PAGE_ID;
    if (!FB_PAGE_TOKEN || !FB_PAGE_ID) {
      errors.facebook = 'FB_PAGE_TOKEN and FB_PAGE_ID not configured';
    } else {
      try {
        const endpoint = photo
          ? `https://graph.facebook.com/${FB_PAGE_ID}/photos`
          : `https://graph.facebook.com/${FB_PAGE_ID}/feed`;
        const fbBody = photo
          ? { caption, url: photo, access_token: FB_PAGE_TOKEN }
          : { message: caption, access_token: FB_PAGE_TOKEN };
        if (scheduledFor) {
          fbBody.scheduled_publish_time = Math.floor(new Date(scheduledFor).getTime() / 1000);
          fbBody.published = false;
        }
        const fbResp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fbBody)
        });
        const fbData = await fbResp.json();
        if (fbData.id) {
          results.facebook = { success: true, id: fbData.id };
        } else {
          errors.facebook = fbData.error ? fbData.error.message : 'Unknown error';
        }
      } catch (e) {
        errors.facebook = e.message;
      }
    }
  }

  // ---- INSTAGRAM ----
  if (platforms.includes('instagram')) {
    const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
    const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID;
    if (!FB_PAGE_TOKEN || !IG_ACCOUNT_ID) {
      errors.instagram = 'FB_PAGE_TOKEN and IG_ACCOUNT_ID not configured';
    } else {
      try {
        // Instagram requires a photo for feed posts
        if (!photo) {
          errors.instagram = 'Instagram feed posts require an image';
        } else {
          // Step 1: Create media container
          const containerResp = await fetch(`https://graph.facebook.com/${IG_ACCOUNT_ID}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: photo, caption, access_token: FB_PAGE_TOKEN })
          });
          const containerData = await containerResp.json();
          if (!containerData.id) {
            errors.instagram = containerData.error ? containerData.error.message : 'Container creation failed';
          } else {
            // Step 2: Publish container
            const publishResp = await fetch(`https://graph.facebook.com/${IG_ACCOUNT_ID}/media_publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creation_id: containerData.id, access_token: FB_PAGE_TOKEN })
            });
            const publishData = await publishResp.json();
            if (publishData.id) {
              results.instagram = { success: true, id: publishData.id };
            } else {
              errors.instagram = publishData.error ? publishData.error.message : 'Publish failed';
            }
          }
        }
      } catch (e) {
        errors.instagram = e.message;
      }
    }
  }

  // ---- LINKEDIN ----
  if (platforms.includes('linkedin')) {
    const LI_TOKEN = process.env.LI_TOKEN;
    const LI_PERSON_ID = process.env.LI_PERSON_ID;
    if (!LI_TOKEN || !LI_PERSON_ID) {
      errors.linkedin = 'LI_TOKEN and LI_PERSON_ID not configured';
    } else {
      try {
        const liBody = {
          author: `urn:li:person:${LI_PERSON_ID}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: caption },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
        };
        const liResp = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LI_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(liBody)
        });
        const liData = await liResp.json();
        if (liData.id) {
          results.linkedin = { success: true, id: liData.id };
        } else {
          errors.linkedin = liData.message || 'LinkedIn post failed';
        }
      } catch (e) {
        errors.linkedin = e.message;
      }
    }
  }

  // ---- TIKTOK ----
  if (platforms.includes('tiktok')) {
    const TT_TOKEN = process.env.TT_TOKEN;
    if (!TT_TOKEN) {
      errors.tiktok = 'TT_TOKEN not configured';
    } else {
      // TikTok text posts via Content Posting API
      try {
        const ttResp = await fetch('https://open.tiktokapis.com/v2/post/publish/text/check/', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${TT_TOKEN}`, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ post_info: { text: caption, privacy_level: 'PUBLIC_TO_EVERYONE' }, source_info: { source: 'PULL_FROM_URL' } })
        });
        const ttData = await ttResp.json();
        if (ttData.data && ttData.data.publish_id) {
          results.tiktok = { success: true, id: ttData.data.publish_id };
        } else {
          errors.tiktok = ttData.error ? ttData.error.message : 'TikTok post failed — video required for most post types';
        }
      } catch (e) {
        errors.tiktok = e.message;
      }
    }
  }

  const hasSuccess = Object.keys(results).length > 0;
  const hasErrors = Object.keys(errors).length > 0;

  return res.status(200).json({
    success: hasSuccess,
    results,
    errors: hasErrors ? errors : undefined,
    message: hasErrors && !hasSuccess
      ? 'All platforms failed. Check API credentials in Connections.'
      : hasErrors
      ? 'Some platforms published, some failed. See errors.'
      : 'Published successfully to all selected platforms.'
  });
}
