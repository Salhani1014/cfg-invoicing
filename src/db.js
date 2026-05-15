const { getSupabase } = require('./supabase');

// `supabase` is a Proxy that forwards every access to the singleton client
// returned by getSupabase(). This keeps the existing call sites unchanged
// while ensuring all queries use the authenticated session set after sign-in.
const supabase = new Proxy({}, {
  get(_t, prop) {
    return getSupabase()[prop];
  },
});

// ─── Clients ────────────────────────────────────────────────────────────────

async function getClients() {
  const [{ data: clients, error: ce }, { data: invoices, error: ie }] = await Promise.all([
    supabase.from('clients').select('*').order('last_name').order('first_name'),
    supabase.from('invoices').select('id, client_id, invoice_date, total_amount, paid')
  ]);
  if (ce) throw ce;
  if (ie) throw ie;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return (clients || []).map(c => {
    const ci = (invoices || []).filter(i => i.client_id === c.id);
    const sorted = [...ci].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
    const last = sorted[0];
    const overdue_count = ci.filter(i => !i.paid && i.invoice_date <= cutoffStr).length;
    const total_unpaid = ci.filter(i => !i.paid).reduce((s, i) => s + Number(i.total_amount), 0);
    return { ...c, last_invoice_date: last?.invoice_date || null, last_invoice_amount: last?.total_amount || null, overdue_count, total_unpaid };
  });
}

async function addClient(data) {
  const { data: row, error } = await supabase
    .from('clients')
    .insert({ first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone })
    .select('id').single();
  if (error) throw error;
  return row.id;
}

async function updateClient(id, data) {
  const { error } = await supabase
    .from('clients')
    .update({ first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone })
    .eq('id', id);
  if (error) throw error;
}

async function deleteClient(id) {
  const { error } = await supabase.rpc('delete_client_cascade', { p_client_id: id });
  if (error) throw error;
}

async function getClientById(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

async function createInvoice(data) {
  const { data: result, error } = await supabase.rpc('create_invoice_with_items', {
    p_client_id:      data.clientId,
    p_invoice_number: data.invoiceNumber,
    p_invoice_date:   data.invoiceDate,
    p_total_amount:   data.totalAmount,
    p_payment_method: data.paymentMethod || null,
    p_invoice_type:   data.invoiceType || 'lead',
    p_created_by:     data.createdBy || 'braxton',
    p_line_items:     data.lineItems.map(li => ({
      lead_type:          li.leadType,
      quantity:           li.quantity,
      unit_price:         li.unitPrice,
      guaranteed_minimum: li.guaranteedMinimum || null
    }))
  });
  if (error) throw error;
  return result;
}

async function updateInvoicePdfPath(id, pdfPath) {
  const { error } = await supabase.from('invoices').update({ pdf_path: pdfPath }).eq('id', id);
  if (error) throw error;
}

async function markInvoiceEmailed(id) {
  const { error } = await supabase.from('invoices').update({ emailed: true }).eq('id', id);
  if (error) throw error;
}

async function getInvoices(clientId) {
  const { data: invoices, error } = await supabase
    .from('invoices').select('*').eq('client_id', clientId).order('invoice_date', { ascending: false });
  if (error) throw error;
  if (!invoices || !invoices.length) return [];

  const { data: lineItems, error: le } = await supabase
    .from('invoice_line_items').select('invoice_id, lead_type')
    .in('invoice_id', invoices.map(i => i.id));
  if (le) throw le;

  const ltByInvoice = {};
  for (const li of (lineItems || [])) {
    if (!ltByInvoice[li.invoice_id]) ltByInvoice[li.invoice_id] = [];
    ltByInvoice[li.invoice_id].push(li.lead_type);
  }
  return invoices.map(inv => ({ ...inv, lead_types: (ltByInvoice[inv.id] || []).join(',') }));
}

async function getAllInvoices() {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email)')
    .order('invoice_date', { ascending: false });
  if (error) throw error;

  const { data: lineItems, error: le } = await supabase.from('invoice_line_items').select('*');
  if (le) throw le;

  const liByInvoice = {};
  for (const li of (lineItems || [])) {
    if (!liByInvoice[li.invoice_id]) liByInvoice[li.invoice_id] = [];
    liByInvoice[li.invoice_id].push(li);
  }

  return (invoices || []).map(inv => ({
    ...inv,
    first_name: inv.clients.first_name,
    last_name:  inv.clients.last_name,
    email:      inv.clients.email,
    line_items_raw: (liByInvoice[inv.id] || [])
      .map(li => `${li.lead_type}\x1f${li.quantity}\x1f${li.unit_price}\x1f${li.guaranteed_minimum || ''}`)
      .join(',')
  }));
}

async function getNextInvoiceSeq(clientId) {
  const { count } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true }).eq('client_id', clientId);
  return (count || 0) + 1;
}

async function getLastClientInvoice(clientId) {
  const { data: invoices } = await supabase
    .from('invoices').select('*').eq('client_id', clientId)
    .order('invoice_date', { ascending: false }).limit(1);
  const invoice = invoices?.[0];
  if (!invoice) return null;

  const { data: lineItems, error: le } = await supabase
    .from('invoice_line_items')
    .select('lead_type, quantity, unit_price, guaranteed_minimum')
    .eq('invoice_id', invoice.id);
  if (le) throw le;

  return {
    ...invoice,
    lineItems: (lineItems || []).map(li => ({
      leadType: li.lead_type, quantity: li.quantity,
      unitPrice: li.unit_price, guaranteedMinimum: li.guaranteed_minimum
    }))
  };
}

async function markReminderSent(id) {
  const { error } = await supabase
    .from('invoices').update({ reminder_sent_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function updateInvoiceNotes(id, notes) {
  const { error } = await supabase
    .from('invoices').update({ notes: notes || null }).eq('id', id);
  if (error) throw error;
}

async function getOverdueInvoices(days = 7) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email, phone)')
    .eq('paid', false).is('reminder_sent_at', null);
  if (error) throw error;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return (data || [])
    .filter(inv => inv.invoice_date <= cutoffStr)
    .map(inv => ({
      ...inv,
      first_name: inv.clients.first_name, last_name: inv.clients.last_name,
      email: inv.clients.email, phone: inv.clients.phone
    }));
}

async function markInvoicePaid(id) {
  const { error } = await supabase
    .from('invoices').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function deleteInvoice(id) {
  const { error } = await supabase.rpc('delete_invoice_cascade', { p_invoice_id: id });
  if (error) throw error;
}

async function getInvoiceById(id) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, clients!inner(first_name, last_name, email, phone)')
    .eq('id', id).single();
  if (error) throw error;

  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('lead_type, quantity, unit_price, guaranteed_minimum')
    .eq('invoice_id', id);

  return {
    ...invoice,
    first_name: invoice.clients.first_name, last_name: invoice.clients.last_name,
    email: invoice.clients.email, phone: invoice.clients.phone,
    lineItems: (lineItems || []).map(li => ({
      leadType: li.lead_type, quantity: li.quantity,
      unitPrice: li.unit_price, guaranteedMinimum: li.guaranteed_minimum
    }))
  };
}

// ─── Settings ───────────────────────────────────────────────────────────────

async function getSetting(key) {
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data?.value || null;
}

async function setSetting(key, value) {
  const { error } = await supabase.from('settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function getAllSettings() {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) throw error;
  return (data || []).reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
}

async function getSchemaVersion() {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'schemaVersion').single();
  if (error && error.code !== 'PGRST116') throw error;
  return data ? Number(data.value) : 0;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function closeDb() { /* no-op: Supabase is stateless */ }

module.exports = {
  getClients, addClient, updateClient, deleteClient, getClientById,
  createInvoice, updateInvoicePdfPath, markInvoiceEmailed,
  markInvoicePaid, deleteInvoice, getInvoiceById,
  getLastClientInvoice, markReminderSent, updateInvoiceNotes, getOverdueInvoices,
  getInvoices, getAllInvoices, getNextInvoiceSeq,
  getSetting, setSetting, getAllSettings, getSchemaVersion,
  closeDb
};
