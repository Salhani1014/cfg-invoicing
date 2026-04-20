const LEAD_TYPE_SHORT = {
  'Trucker IUL Leads': 'Trucker IUL',
  'Spanish IUL Leads': 'Spanish IUL',
  'Widow of Veteran Leads': 'Widow/Vet'
};

const ALL_LEAD_TYPES = ['Trucker IUL Leads', 'Spanish IUL Leads', 'Widow of Veteran Leads'];

function parseLeadTypes(raw) {
  if (!raw) return '—';
  return raw.split(',')
    .map(r => { const [type] = r.split(':'); return LEAD_TYPE_SHORT[type] || type; })
    .join(', ');
}

function getRawLeadTypes(raw) {
  if (!raw) return [];
  return raw.split(',').map(r => r.split(':')[0]);
}

function formatDate(d) {
  if (!d) return '—';
  const s = String(d).includes('T') ? d : d + 'T12:00:00';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function invoicesScreen(container) {
  let allInvoices = [];
  let filter = 'all';
  let search = '';
  let sort = 'date-desc';
  let leadTypeFilter = 'all';
  let selectedIds = new Set();

  try {
    allInvoices = await window.api.db.getAllInvoices();
  } catch (err) {
    console.error('Failed to load invoices:', err);
  }

  function getFiltered() {
    let result = allInvoices.filter(inv => {
      const matchesStatus = filter === 'all' || (filter === 'paid' ? inv.paid : !inv.paid);
      const q = search.toLowerCase();
      const matchesSearch = !q ||
        `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(q) ||
        inv.invoice_number.toLowerCase().includes(q);
      const matchesLeadType = leadTypeFilter === 'all'
        ? true
        : leadTypeFilter === '__custom__'
          ? inv.invoice_type === 'custom'
          : getRawLeadTypes(inv.line_items_raw).includes(leadTypeFilter);
      return matchesStatus && matchesSearch && matchesLeadType;
    });

    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'date-desc':    return new Date(b.invoice_date) - new Date(a.invoice_date);
        case 'date-asc':     return new Date(a.invoice_date) - new Date(b.invoice_date);
        case 'client-az':    return `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`);
        case 'client-za':    return `${b.last_name}${b.first_name}`.localeCompare(`${a.last_name}${a.first_name}`);
        case 'amount-desc':  return b.total_amount - a.total_amount;
        case 'amount-asc':   return a.total_amount - b.total_amount;
        default: return 0;
      }
    });

    return result;
  }

  const SORT_LABELS = {
    'date-desc': 'Newest First', 'date-asc': 'Oldest First',
    'client-az': 'Client A→Z', 'client-za': 'Client Z→A',
    'amount-desc': 'Amount High→Low', 'amount-asc': 'Amount Low→High',
  };

  function render() {
    const filtered = getFiltered();
    const unpaidCount = allInvoices.filter(i => !i.paid).length;
    const unpaidTotal = allInvoices.filter(i => !i.paid).reduce((s, i) => s + i.total_amount, 0);
    const allFilteredIds = filtered.map(i => i.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Invoices</h1>
        <input class="search-input" id="invoiceSearch" placeholder="Search client or invoice #..." value="${esc(search)}" style="width:240px">
      </div>

      <div class="card" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;padding:16px 24px">
        <div>
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Total Outstanding</div>
          <div style="font-size:28px;font-weight:700;color:${unpaidTotal > 0 ? 'var(--red)' : 'var(--green)'}">${fmt(unpaidTotal)}</div>
        </div>
        <div style="font-size:13px;color:var(--text-muted)">${unpaidCount} unpaid invoice${unpaidCount !== 1 ? 's' : ''}</div>
      </div>

      <div class="card">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px">
          <div style="display:flex;gap:6px">
            ${['all', 'unpaid', 'paid'].map(f => `
              <button class="btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}" data-filter="${f}">
                ${f === 'all' ? 'All' : f === 'unpaid' ? 'Unpaid' : 'Paid'}
              </button>
            `).join('')}
          </div>
          <div style="width:1px;height:24px;background:var(--border);margin:0 4px"></div>
          <select id="leadTypeFilter" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer">
            <option value="all" ${leadTypeFilter === 'all' ? 'selected' : ''}>All Lead Types</option>
            ${ALL_LEAD_TYPES.map(lt => `<option value="${esc(lt)}" ${leadTypeFilter === lt ? 'selected' : ''}>${lt}</option>`).join('')}
            <option value="__custom__" ${leadTypeFilter === '__custom__' ? 'selected' : ''}>Custom Invoices</option>
          </select>
          <div style="width:1px;height:24px;background:var(--border);margin:0 4px"></div>
          <select id="sortSelect" style="background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:13px;cursor:pointer">
            ${Object.entries(SORT_LABELS).map(([v, l]) =>
              `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`
            ).join('')}
          </select>
          <div style="margin-left:auto;font-size:12px;color:var(--text-muted)">${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}</div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:36px"><input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''} style="accent-color:var(--gold)"></th>
                <th>Invoice #</th>
                <th>Client</th>
                <th>Lead Types</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0
                ? `<tr><td colspan="8"><div class="empty-state"><h3>No invoices</h3><p>No invoices match your current filter.</p></div></td></tr>`
                : filtered.map(inv => renderRow(inv)).join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      <div id="bulkBar" style="display:${selectedIds.size > 0 ? 'flex' : 'none'};position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 20px;gap:12px;align-items:center;z-index:500;box-shadow:0 4px 24px rgba(0,0,0,0.5)">
        <span style="font-size:13px;color:var(--text-muted)">${selectedIds.size} selected</span>
        <button class="btn btn-primary btn-sm" id="bulkMarkPaid">Mark Paid</button>
        <button class="btn btn-danger btn-sm" id="bulkDelete">Delete</button>
        <button class="btn btn-ghost btn-sm" id="bulkClear">Clear</button>
      </div>
    `;

    // Wire controls
    container.querySelector('#invoiceSearch').addEventListener('input', e => { search = e.target.value; render(); });
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => { filter = btn.dataset.filter; selectedIds.clear(); render(); });
    });
    container.querySelector('#leadTypeFilter').addEventListener('change', e => { leadTypeFilter = e.target.value; render(); });
    container.querySelector('#sortSelect').addEventListener('change', e => { sort = e.target.value; render(); });

    // Select all
    container.querySelector('#selectAll').addEventListener('change', e => {
      if (e.target.checked) allFilteredIds.forEach(id => selectedIds.add(id));
      else allFilteredIds.forEach(id => selectedIds.delete(id));
      render();
    });

    // Row checkboxes
    container.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
        render();
      });
    });

    // Row actions
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, Number(btn.dataset.id)));
    });

    // Bulk bar
    const bulkBar = container.querySelector('#bulkBar');
    if (bulkBar) {
      bulkBar.querySelector('#bulkMarkPaid')?.addEventListener('click', bulkMarkPaid);
      bulkBar.querySelector('#bulkDelete')?.addEventListener('click', bulkDelete);
      bulkBar.querySelector('#bulkClear')?.addEventListener('click', () => { selectedIds.clear(); render(); });
    }
  }

  function renderRow(inv) {
    const isPaid = !!inv.paid;
    const isSelected = selectedIds.has(inv.id);
    const hasReminder = !!inv.reminder_sent_at;
    const hasNote = !!(inv.notes && inv.notes.trim());

    const statusBadge = isPaid
      ? `<span class="badge badge-green">Paid</span><div style="font-size:11px;color:var(--text-muted);margin-top:3px">${formatDate(inv.paid_at)}</div>`
      : `<span class="badge badge-red">Unpaid</span>${hasReminder ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Reminded ${formatDate(inv.reminder_sent_at)}</div>` : ''}`;

    const noteBtn = `<button class="btn btn-ghost btn-sm" data-action="note" data-id="${inv.id}" title="${hasNote ? esc(inv.notes).replace(/[\r\n]+/g, ' ') : 'Add note'}" style="${hasNote ? 'color:var(--gold)' : ''}">📝</button>`;

    const actions = isPaid
      ? `<button class="btn btn-ghost btn-sm" data-action="resendReceipt" data-id="${inv.id}">Resend Receipt</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`
      : `<button class="btn btn-primary btn-sm" data-action="markPaid" data-id="${inv.id}">Mark Paid</button>
         <button class="btn btn-ghost btn-sm" data-action="sendAgain" data-id="${inv.id}">Resend</button>
         <button class="btn btn-ghost btn-sm" data-action="sendReminder" data-id="${inv.id}" ${hasReminder ? 'style="color:var(--text-muted)"' : ''}>Remind</button>
         ${noteBtn}
         <button class="btn btn-danger btn-sm" data-action="delete" data-id="${inv.id}">Delete</button>`;

    const mainRow = `
      <tr style="${isSelected ? 'background:rgba(201,168,76,0.06)' : ''}">
        <td><input type="checkbox" class="row-check" data-id="${inv.id}" ${isSelected ? 'checked' : ''} style="accent-color:var(--gold)"></td>
        <td style="color:var(--gold);font-weight:600;font-size:13px">${esc(inv.invoice_number)}</td>
        <td><strong>${esc(inv.first_name)} ${esc(inv.last_name)}</strong></td>
        <td style="color:var(--text-muted);font-size:13px">${esc(parseLeadTypes(inv.line_items_raw))}</td>
        <td style="color:var(--text-muted)">${formatDate(inv.invoice_date)}</td>
        <td style="font-weight:600">${fmt(inv.total_amount)}</td>
        <td>${statusBadge}</td>
        <td><div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">${actions}</div></td>
      </tr>
    `;

    const noteRow = hasNote
      ? `<tr>
           <td colspan="8" style="padding:0 20px 10px 52px;border-bottom:none">
             <div style="border-left:2px solid var(--gold);padding:6px 12px;background:rgba(201,168,76,0.05);font-size:12px;color:var(--text-muted);font-style:italic;border-radius:0 4px 4px 0">
               ${esc(inv.notes)}
             </div>
           </td>
         </tr>`
      : '';

    return mainRow + noteRow;
  }

  async function handleAction(action, invoiceId) {
    if (action === 'note') { openNoteModal(invoiceId); return; }

    if (action === 'delete') {
      if (!confirm('Delete this invoice? This cannot be undone.')) return;
      try {
        await window.api.db.deleteInvoice(invoiceId);
        allInvoices = allInvoices.filter(i => i.id !== invoiceId);
        selectedIds.delete(invoiceId);
        render();
        if (window.updateUnpaidBadge) window.updateUnpaidBadge();
        showToast('Invoice deleted.', 'success');
      } catch (err) {
        showToast('Failed to delete invoice.', 'error');
      }
      return;
    }

    const btn = container.querySelector(`[data-action="${action}"][data-id="${invoiceId}"]`);
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
      if (action === 'markPaid') {
        const saveFolder = await window.api.settings.get('saveFolder');
        if (!saveFolder) throw new Error('No save folder set in Settings.');
        await window.api.pdf.generatePaid({ invoiceId, saveFolder });
        await window.api.mail.sendPaidReceipt({ invoiceId });
        allInvoices = await window.api.db.getAllInvoices();
        selectedIds.delete(invoiceId);
        render();
        if (window.updateUnpaidBadge) window.updateUnpaidBadge();
        showToast('Marked paid — receipt emailed!', 'success');
      } else if (action === 'sendAgain') {
        await window.api.mail.sendInvoiceAgain({ invoiceId });
        showToast('Invoice re-sent.', 'success');
        if (btn) { btn.disabled = false; btn.textContent = origText; }
      } else if (action === 'resendReceipt') {
        await window.api.mail.sendPaidReceipt({ invoiceId });
        showToast('Receipt re-sent.', 'success');
        if (btn) { btn.disabled = false; btn.textContent = origText; }
      } else if (action === 'sendReminder') {
        await window.api.mail.sendReminder({ invoiceId });
        allInvoices = await window.api.db.getAllInvoices();
        render();
        showToast('Reminder sent.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Something went wrong.', 'error');
      if (btn) { btn.disabled = false; if (origText) btn.textContent = origText; }
    }
  }

  function openNoteModal(invoiceId) {
    const inv = allInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Internal Note</h2>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">${esc(inv.invoice_number)} — ${esc(inv.first_name)} ${esc(inv.last_name)}</p>
        <div class="form-group">
          <label class="form-label">Note (private, not on invoice)</label>
          <textarea class="form-input" id="noteText" rows="5" style="resize:vertical;font-family:inherit">${esc(inv.notes || '')}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelNote">Cancel</button>
          <button class="btn btn-primary" id="saveNote">Save Note</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#cancelNote').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#saveNote').addEventListener('click', async () => {
      const notes = overlay.querySelector('#noteText').value.trim();
      try {
        await window.api.db.updateInvoiceNotes(invoiceId, notes);
        const idx = allInvoices.findIndex(i => i.id === invoiceId);
        if (idx !== -1) allInvoices[idx] = { ...allInvoices[idx], notes };
        overlay.remove();
        render();
        showToast('Note saved.', 'success');
      } catch (e) {
        showToast('Failed to save note.', 'error');
      }
    });
  }

  async function bulkMarkPaid() {
    const ids = [...selectedIds];
    const unpaidIds = ids.filter(id => {
      const inv = allInvoices.find(i => i.id === id);
      return inv && !inv.paid;
    });
    if (!unpaidIds.length) { showToast('No unpaid invoices selected.', 'error'); return; }
    const saveFolder = await window.api.settings.get('saveFolder');
    if (!saveFolder) { showToast('No save folder set in Settings.', 'error'); return; }
    if (!confirm(`Mark ${unpaidIds.length} invoice${unpaidIds.length !== 1 ? 's' : ''} as paid and send receipts?`)) return;
    let done = 0;
    for (const invoiceId of unpaidIds) {
      try {
        await window.api.pdf.generatePaid({ invoiceId, saveFolder });
        await window.api.mail.sendPaidReceipt({ invoiceId });
        done++;
      } catch (e) {
        console.error(`Bulk paid failed for ${invoiceId}:`, e.message);
      }
    }
    allInvoices = await window.api.db.getAllInvoices();
    selectedIds.clear();
    render();
    if (window.updateUnpaidBadge) window.updateUnpaidBadge();
    showToast(`${done} invoice${done !== 1 ? 's' : ''} marked paid.`, 'success');
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} invoice${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    let done = 0;
    for (const id of ids) {
      try { await window.api.db.deleteInvoice(id); done++; } catch (_) {}
    }
    allInvoices = allInvoices.filter(i => !ids.includes(i.id));
    selectedIds.clear();
    render();
    if (window.updateUnpaidBadge) window.updateUnpaidBadge();
    showToast(`${done} invoice${done !== 1 ? 's' : ''} deleted.`, 'success');
  }

  render();
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
