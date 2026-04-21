const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Contractors ─────────────────────────────────────────────────────────────

async function getContractors() {
  const year = new Date().getFullYear().toString();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [{ data: contractors, error: ce }, { data: payments, error: pe }] = await Promise.all([
    supabase.from('contractors').select('*').order('legal_name'),
    supabase.from('contractor_payments')
      .select('contractor_id, total_amount')
      .gte('pay_date', yearStart)
      .lte('pay_date', yearEnd)
  ]);
  if (ce) throw ce;
  if (pe) throw pe;

  const ytdByContractor = {};
  for (const p of (payments || [])) {
    ytdByContractor[p.contractor_id] = (ytdByContractor[p.contractor_id] || 0) + Number(p.total_amount);
  }

  return (contractors || []).map(c => ({
    ...c,
    ytd_total: ytdByContractor[c.id] || 0
  }));
}

async function addContractor(data) {
  const { data: row, error } = await supabase
    .from('contractors')
    .insert({
      legal_name: data.legalName,
      email: data.email,
      phone: data.phone || null,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      tax_id: data.taxId,
      tax_classification: data.taxClassification,
      w9_on_file: data.w9OnFile || false,
      notes: data.notes || null
    })
    .select('id').single();
  if (error) throw error;
  return row.id;
}

async function updateContractor(id, data) {
  const { error } = await supabase
    .from('contractors')
    .update({
      legal_name: data.legalName,
      email: data.email,
      phone: data.phone || null,
      address: data.address,
      city: data.city,
      state: data.state,
      zip: data.zip,
      tax_id: data.taxId,
      tax_classification: data.taxClassification,
      w9_on_file: data.w9OnFile || false,
      notes: data.notes || null
    })
    .eq('id', id);
  if (error) throw error;
}

async function deleteContractor(id) {
  const { count, error: ce } = await supabase
    .from('contractor_payments')
    .select('*', { count: 'exact', head: true })
    .eq('contractor_id', id);
  if (ce) throw ce;
  if (count > 0) throw new Error('Cannot delete a contractor with payment history.');
  const { error } = await supabase.from('contractors').delete().eq('id', id);
  if (error) throw error;
}

// ─── Payments ────────────────────────────────────────────────────────────────

async function addContractorPayment(data) {
  const { data: row, error } = await supabase
    .from('contractor_payments')
    .insert({
      contractor_id: data.contractorId,
      pay_date: data.payDate,
      pay_period_start: data.payPeriodStart || null,
      pay_period_end: data.payPeriodEnd || null,
      hours: data.hours,
      hourly_rate: data.hourlyRate,
      total_amount: data.totalAmount,
      description: data.description,
      payment_method: data.paymentMethod || 'paymentZelle',
      recurring: data.recurring || false,
      pdf_path: null,
      emailed: false,
      created_by: data.createdBy || 'braxton'
    })
    .select('id').single();
  if (error) throw error;
  return row.id;
}

async function getContractorPayments(contractorId) {
  const { data, error } = await supabase
    .from('contractor_payments')
    .select('*')
    .eq('contractor_id', contractorId)
    .order('pay_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateContractorPayment(id, data) {
  const { error } = await supabase
    .from('contractor_payments')
    .update({
      pay_date: data.payDate,
      pay_period_start: data.payPeriodStart || null,
      pay_period_end: data.payPeriodEnd || null,
      hours: data.hours,
      hourly_rate: data.hourlyRate,
      total_amount: data.totalAmount,
      description: data.description,
      payment_method: data.paymentMethod || 'paymentZelle',
      recurring: data.recurring || false
    })
    .eq('id', id);
  if (error) throw error;
}

async function deleteContractorPayment(id) {
  const { error } = await supabase.from('contractor_payments').delete().eq('id', id);
  if (error) throw error;
}

async function updateContractorPaymentPdfPath(id, pdfPath) {
  const { error } = await supabase
    .from('contractor_payments')
    .update({ pdf_path: pdfPath })
    .eq('id', id);
  if (error) throw error;
}

async function markContractorPaymentEmailed(id) {
  const { error } = await supabase
    .from('contractor_payments')
    .update({ emailed: true })
    .eq('id', id);
  if (error) throw error;
}

async function getContractorYtd(contractorId, year) {
  const { data, error } = await supabase
    .from('contractor_payments')
    .select('total_amount')
    .eq('contractor_id', contractorId)
    .gte('pay_date', `${year}-01-01`)
    .lte('pay_date', `${year}-12-31`);
  if (error) throw error;
  return (data || []).reduce((s, p) => s + Number(p.total_amount), 0);
}

async function getContractorPaymentsFiltered({ year, contractorId, dateStart, dateEnd }) {
  let query = supabase
    .from('contractor_payments')
    .select('*, contractors!inner(legal_name, tax_id, tax_classification)')
    .order('pay_date', { ascending: false });

  if (contractorId) {
    query = query.eq('contractor_id', contractorId);
  }
  if (dateStart) {
    query = query.gte('pay_date', dateStart);
  } else if (year) {
    query = query.gte('pay_date', `${year}-01-01`);
  }
  if (dateEnd) {
    query = query.lte('pay_date', dateEnd);
  } else if (year) {
    query = query.lte('pay_date', `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(p => ({
    ...p,
    legal_name: p.contractors.legal_name,
    tax_id: p.contractors.tax_id,
    tax_classification: p.contractors.tax_classification
  }));
}

async function getContractorsForExport({ year, contractorId, dateStart, dateEnd }) {
  const payments = await getContractorPaymentsFiltered({ year, contractorId, dateStart, dateEnd });

  const byContractor = {};
  for (const p of payments) {
    if (!byContractor[p.contractor_id]) {
      byContractor[p.contractor_id] = {
        legal_name: p.legal_name,
        tax_id: p.tax_id,
        tax_classification: p.tax_classification,
        total: 0
      };
    }
    byContractor[p.contractor_id].total += Number(p.total_amount);
  }

  return Object.values(byContractor).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
}

module.exports = {
  getContractors, addContractor, updateContractor, deleteContractor,
  addContractorPayment, getContractorPayments, updateContractorPayment,
  deleteContractorPayment, updateContractorPaymentPdfPath, markContractorPaymentEmailed,
  getContractorYtd, getContractorPaymentsFiltered, getContractorsForExport
};
