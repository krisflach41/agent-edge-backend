import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ===== GET: Load profile =====
  if (req.method === 'GET') {
    try {
      const email = (req.query.email || '').toLowerCase().trim();
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
      }

      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', email)
        .single();

      if (error || !data) {
        return res.status(404).json({ success: false, message: 'Profile not found' });
      }

      return res.status(200).json({ success: true, profile: data });

    } catch (error) {
      console.error('Profile GET error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  // ===== POST: Update profile =====
  if (req.method === 'POST') {
    try {
      const { email, licenseNumber, phone, address, city, state, zip, headshot } = req.body;

      if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
      }

      const cleanEmail = email.toLowerCase().trim();
      const now = new Date().toISOString();

      // Build update object — only include fields that have values
      const updates = { updated_at: now };
      if (licenseNumber !== undefined && licenseNumber !== '') updates.license_number = licenseNumber;
      if (phone !== undefined && phone !== '') updates.phone = phone;
      if (address !== undefined && address !== '') updates.address = address;
      if (city !== undefined && city !== '') updates.city = city;
      if (state !== undefined && state !== '') updates.state = state.toUpperCase();
      if (zip !== undefined && zip !== '') updates.zip = zip;
      if (headshot) updates.headshot_url = headshot;

      const { error } = await supabase
        .from('crm_contacts')
        .update(updates)
        .eq('id', cleanEmail);

      if (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update profile' });
      }

      // Track profile update
      try {
        await supabase
          .from('crm_activity')
          .insert([{
            crm_id: cleanEmail,
            type: 'profile_update',
            subject: 'Profile Updated',
            body: 'Updated fields: ' + Object.keys(updates).filter(k => k !== 'updated_at').join(', '),
            date: now
          }]);
      } catch (activityError) {
        console.error('Activity tracking failed:', activityError);
      }

      return res.status(200).json({ success: true, message: 'Profile updated' });

    } catch (error) {
      console.error('Profile POST error:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
