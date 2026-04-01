import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // ===== GET: Load profile =====
  if (req.method === 'GET') {
    try {
      const email = (req.query.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ success: false, message: 'Email required' });

      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', email)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      // Also get user record for brokerage/title
      const { data: userData } = await supabase
        .from('users')
        .select('full_name, email, brokerage, title, ae_id')
        .eq('email', email)
        .single();

      var profile = data;
      if (userData) {
        profile.user_name = userData.full_name;
        profile.user_brokerage = userData.brokerage;
        profile.user_title = userData.title;
        profile.user_ae_id = userData.ae_id;
      }

      return res.status(200).json({ success: true, profile: profile });
    } catch (error) {
      console.error('Profile GET error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // ===== POST: Update profile =====
  if (req.method === 'POST') {
    try {
      var body = req.body;
      var action = body.action || 'update';

      // --- PASSWORD CHANGE ---
      if (action === 'changePassword') {
        var pwEmail = (body.email || '').toLowerCase().trim();
        if (!pwEmail || !body.currentPassword || !body.newPassword) {
          return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const { data: user } = await supabase
          .from('users')
          .select('password')
          .eq('email', pwEmail)
          .single();

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (user.password !== body.currentPassword) {
          return res.status(400).json({ success: false, message: 'Current password is incorrect' });
        }

        if (body.newPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        await supabase.from('users').update({ password: body.newPassword }).eq('email', pwEmail);
        return res.status(200).json({ success: true, message: 'Password updated' });
      }

      // --- ADMIN PASSWORD RESET (from Mission Control Settings) ---
      if (action === 'adminResetPassword') {
        var resetEmail = (body.email || '').toLowerCase().trim();
        if (!resetEmail || !body.newPassword) {
          return res.status(400).json({ success: false, message: 'Email and new password required' });
        }

        const { data: resetUser } = await supabase
          .from('users')
          .select('email')
          .eq('email', resetEmail)
          .single();

        if (!resetUser) return res.status(404).json({ success: false, message: 'User not found' });

        if (body.newPassword.length < 6) {
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        await supabase.from('users').update({ password: body.newPassword }).eq('email', resetEmail);
        return res.status(200).json({ success: true, message: 'Password reset successfully' });
      }

      // --- PROFILE UPDATE ---
      var cleanEmail = (body.email || '').toLowerCase().trim();
      if (!cleanEmail) return res.status(400).json({ success: false, message: 'Email required' });

      var now = new Date().toISOString();

      var crmUpdates = { updated_at: now };
      if (body.name !== undefined) crmUpdates.name = body.name;
      if (body.phone !== undefined) crmUpdates.phone = body.phone;
      if (body.company !== undefined) crmUpdates.company = body.company;
      if (body.title !== undefined) crmUpdates.title = body.title;
      if (body.website !== undefined) crmUpdates.website = body.website;
      if (body.facebook !== undefined) crmUpdates.facebook = body.facebook;
      if (body.instagram !== undefined) crmUpdates.instagram = body.instagram;
      if (body.linkedin !== undefined) crmUpdates.linkedin = body.linkedin;
      if (body.tiktok !== undefined) crmUpdates.tiktok = body.tiktok;
      if (body.licenseNumber !== undefined) crmUpdates.license_number = body.licenseNumber;
      if (body.address !== undefined) crmUpdates.address = body.address;
      if (body.city !== undefined) crmUpdates.city = body.city;
      if (body.state !== undefined) crmUpdates.state = (body.state || '').toUpperCase();
      if (body.zip !== undefined) crmUpdates.zip = body.zip;
      if (body.headshot) crmUpdates.headshot_url = body.headshot;

      const { error: crmErr } = await supabase
        .from('crm_contacts')
        .update(crmUpdates)
        .eq('id', cleanEmail);

      if (crmErr) {
        console.error('CRM update error:', crmErr);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
      }

      // Sync to users table
      var userUpdates = {};
      if (body.name !== undefined) userUpdates.full_name = body.name;
      if (body.company !== undefined) userUpdates.brokerage = body.company;
      if (body.title !== undefined) userUpdates.title = body.title;
      if (Object.keys(userUpdates).length > 0) {
        await supabase.from('users').update(userUpdates).eq('email', cleanEmail);
      }

      // Track
      try {
        var changedFields = Object.keys(crmUpdates).filter(function(k) { return k !== 'updated_at'; });
        await supabase.from('crm_activity').insert([{
          crm_id: cleanEmail,
          type: 'profile_update',
          subject: 'Profile Updated',
          body: 'Updated: ' + changedFields.join(', '),
          date: now
        }]);
      } catch (actErr) { console.error('Activity tracking failed:', actErr); }

      return res.status(200).json({ success: true, message: 'Profile updated' });

    } catch (error) {
      console.error('Profile POST error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
