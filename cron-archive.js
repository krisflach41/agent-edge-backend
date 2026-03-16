import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Also allow manual trigger via POST with query param
  const isArchiveQuery = req.query.action === 'query';
  if (isArchiveQuery) {
    return handleArchiveQuery(req, res);
  }

  try {
    const now = new Date();
    const results = { archived: 0, purged: 0, scenariosDeleted: 0 };

    // 1. Archive orders older than 90 days
    const archiveCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: toArchive, error: archErr } = await supabase
      .from('orders')
      .select('order_id')
      .or('archived.is.null,archived.eq.false')
      .lt('created_at', archiveCutoff);

    if (!archErr && toArchive && toArchive.length > 0) {
      const ids = toArchive.map(o => o.order_id);
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ archived: true, archived_at: now.toISOString() })
        .in('order_id', ids);
      if (!updateErr) results.archived = ids.length;
    }

    // 2. Purge orders older than 3 years
    const purgeCutoff = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: toPurge, error: purgeErr } = await supabase
      .from('orders')
      .select('order_id')
      .lt('created_at', purgeCutoff);

    if (!purgeErr && toPurge && toPurge.length > 0) {
      const ids = toPurge.map(o => o.order_id);
      const { error: delErr } = await supabase
        .from('orders')
        .delete()
        .in('order_id', ids);
      if (!delErr) results.purged = ids.length;
    }

    // 3. Delete scenarios older than 90 days
    const { data: oldScenarios, error: scenErr } = await supabase
      .from('scenario_submissions')
      .select('id')
      .lt('created_at', archiveCutoff);

    if (!scenErr && oldScenarios && oldScenarios.length > 0) {
      const ids = oldScenarios.map(s => s.id);
      const { error: scenDelErr } = await supabase
        .from('scenario_submissions')
        .delete()
        .in('id', ids);
      if (!scenDelErr) results.scenariosDeleted = ids.length;
    }

    return res.status(200).json({ success: true, results });

  } catch (error) {
    console.error('Archive cron error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// Compliance archive query — pull archived orders by date range
async function handleArchiveQuery(req, res) {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start and end date params required (YYYY-MM-DD)' });
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('archived', true)
      .gte('created_at', start + 'T00:00:00Z')
      .lte('created_at', end + 'T23:59:59Z')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const orders = (data || []).map(order => ({
      orderId: order.order_id || '',
      timestamp: order.created_at || '',
      archivedAt: order.archived_at || '',
      name: order.user_name || '',
      email: order.user_email || '',
      brokerage: order.brokerage || '',
      branding: order.co_branding ? 'Co-branded' : 'Kristy-branded only',
      items: order.items ? JSON.stringify(order.items) : '',
      itemCount: order.item_count || 0,
      notes: order.notes || '',
      status: order.status || 'complete',
      cartJson: order.cart_data ? JSON.stringify(order.cart_data) : ''
    }));

    return res.status(200).json({ success: true, orders, count: orders.length });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
