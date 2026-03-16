// /api/unsubscribe.js — Handles email unsubscribe requests

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  var email = (req.query.email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).send(buildPage('Invalid Request', 'No email address provided.', false));
  }

  // If GET — show the confirmation page first
  if (req.method === 'GET' && !req.query.confirm) {
    return res.status(200).send(buildPage(
      'Unsubscribe',
      'Are you sure you want to unsubscribe <strong>' + escHtml(email) + '</strong> from all marketing emails?',
      true,
      email
    ));
  }

  // If confirmed (GET with ?confirm=1 or POST) — process the unsubscribe
  try {
    var now = new Date().toISOString();

    // Update crm_contacts — set unsubscribed flag
    const { error } = await supabase
      .from('crm_contacts')
      .update({ unsubscribed: true, unsubscribed_at: now })
      .ilike('email', email);

    if (error) {
      console.error('Unsubscribe error:', error);
      return res.status(500).send(buildPage('Error', 'Something went wrong. Please try again or contact us directly.', false));
    }

    // Also cancel any active drip enrollments for this email
    try {
      await supabase
        .from('ae_drip_enrollments')
        .update({ status: 'unsubscribed', completed_at: now })
        .ilike('contact_email', email)
        .eq('status', 'active');
    } catch (e) { /* non-critical */ }

    return res.status(200).send(buildPage(
      'Unsubscribed',
      'You have been successfully unsubscribed. You will no longer receive marketing emails from us.<br><br>If this was a mistake, please contact <a href="mailto:kflach@prmg.net" style="color: #002556;">kflach@prmg.net</a>.',
      false
    ));

  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).send(buildPage('Error', 'Something went wrong. Please try again.', false));
  }
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPage(title, message, showButton, email) {
  var buttonHtml = '';
  if (showButton && email) {
    buttonHtml = '<div style="margin-top: 24px;">' +
      '<a href="/api/unsubscribe?email=' + encodeURIComponent(email) + '&confirm=1" ' +
      'style="display: inline-block; padding: 12px 32px; background: #002556; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: bold;">Yes, Unsubscribe Me</a>' +
      '</div>' +
      '<div style="margin-top: 12px; font-size: 12px; color: #999999;">Changed your mind? Just close this page.</div>';
  }

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + title + '</title></head>' +
    '<body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 40px 20px; background: #f9f9f9; text-align: center;">' +
    '<div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">' +
    '<img src="https://kristyflach.com/PRMG-Logo.png" alt="PRMG" height="32" style="margin-bottom: 24px;" />' +
    '<h1 style="font-size: 22px; color: #002556; margin: 0 0 16px 0;">' + title + '</h1>' +
    '<p style="font-size: 14px; line-height: 1.6; color: #555555; margin: 0;">' + message + '</p>' +
    buttonHtml +
    '</div></body></html>';
}
