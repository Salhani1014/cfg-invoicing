export async function clientsScreen(container) {
  let sortBy = 'name';
  let sortDir = 'asc';
  let searchQuery = '';

  const SORTABLE = {
    name:    { label: 'Name',         get: c => `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase() },
    email:   { label: 'Email',        get: c => (c.email || '').toLowerCase() },
    phone:   { label: 'Phone',        get: c => (c.phone || '').toLowerCase() },
    lastInv: { label: 'Last Invoice', get: c => c.last_invoice_date || '' },
    balance: { label: 'Balance Due',  get: c => Number(c.total_unpaid || 0) },
    status:  { label: 'Status',       get: c => getScheduleStatus(c).label },
  };

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Clients</h1>
      <div style="display:flex;gap:10px;align-items:center">
        <input class="search-input" id="clientSearch" placeholder="Search clients...">
        <button class="btn btn-primary" id="addClientBtn">+ Add Client</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="clientTable">
          <thead>
            <tr id="clientHead"></tr>
          </thead>
          <tbody id="clientBody"></tbody>
        </table>
      </div>
    </div>
  `;

  let clients = await window.api.db.getClients();
  renderAll();

  document.getElementById('clientSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderAll();
  });

  document.getElementById('addClientBtn').addEventListener('click', () => {
    openClientModal(null, async () => {
      clients = await window.api.db.getClients();
      renderAll();
    });
  });

  function renderHeader() {
    const head = document.getElementById('clientHead');
    const arrow = key => sortBy === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    head.innerHTML = Object.entries(SORTABLE).map(([k, def]) =>
      `<th data-sort="${k}" style="cursor:pointer;user-select:none">${def.label}${arrow(k)}</th>`
    ).join('') + '<th></th>';
    head.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const k = th.dataset.sort;
        if (sortBy === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        else { sortBy = k; sortDir = 'asc'; }
        renderAll();
      });
    });
  }

  function getFilteredSorted() {
    const q = searchQuery;
    const filtered = q
      ? clients.filter(c => `${c.first_name} ${c.last_name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(q))
      : [...clients];
    const def = SORTABLE[sortBy];
    filtered.sort((a, b) => {
      const av = def.get(a), bv = def.get(b);
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === 'desc') filtered.reverse();
    return filtered;
  }

  function renderAll() {
    renderHeader();
    renderTable(getFilteredSorted());
  }

  function getScheduleStatus(c) {
    if (!c.last_invoice_date) return { label: 'No Invoice', cls: 'badge-red' };
    const last = new Date(c.last_invoice_date); last.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const days = Math.round((now - last) / 86400000);
    if (days < 6)  return { label: 'Up to Date', cls: 'badge-green' };
    if (days === 6) return { label: 'Due Soon', cls: 'badge-yellow' };
    return { label: 'Invoice Due', cls: 'badge-red' };
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtAmt(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderTable(data) {
    const body = document.getElementById('clientBody');
    if (!data.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No clients yet</h3><p>Add your first client to get started.</p></div></td></tr>`;
      return;
    }
    body.innerHTML = data.map(c => {
      const status = getScheduleStatus(c);
      const hasBalance = c.total_unpaid > 0;
      const isOverdue = c.overdue_count > 0;
      const balanceCell = hasBalance
        ? `<span style="color:var(--red);font-weight:700">${fmtAmt(c.total_unpaid)}</span>${isOverdue ? ' <span class="badge badge-red" style="font-size:10px;padding:1px 6px">Overdue</span>' : ''}`
        : `<span style="color:var(--text-muted)">—</span>`;

      const phoneCell = c.phone ? esc(c.phone) : '<span style="color:var(--text-muted)">—</span>';
      const emailCell = c.email ? esc(c.email) : '<span style="color:var(--text-muted)">—</span>';
      return `
        <tr>
          <td><strong>${esc(c.first_name)} ${esc(c.last_name)}</strong></td>
          <td style="color:var(--text-muted)">${emailCell}</td>
          <td style="color:var(--text-muted)">${phoneCell}</td>
          <td style="color:var(--text-muted)">${formatDate(c.last_invoice_date)}</td>
          <td>${balanceCell}</td>
          <td><span class="badge ${status.cls}">${status.label}</span></td>
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" data-action="invoice" data-id="${c.id}" data-name="${esc(c.first_name)} ${esc(c.last_name)}">New Invoice</button>
              <button class="btn btn-ghost btn-sm" data-action="history" data-id="${c.id}">History</button>
              <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${c.id}">Edit</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    body.querySelectorAll('[data-action="invoice"]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.navigate('create-invoice', { clientId: Number(btn.dataset.id), clientName: btn.dataset.name });
      });
    });

    body.querySelectorAll('[data-action="history"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const client = clients.find(c => c.id === Number(btn.dataset.id));
        if (client) openHistoryModal(client);
      });
    });

    body.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const client = clients.find(c => c.id === Number(btn.dataset.id));
        openClientModal(client, async () => {
          clients = await window.api.db.getClients();
          renderTable(clients);
        });
      });
    });
  }

  async function openHistoryModal(client) {
    const invoices = await window.api.db.getInvoices(client.id);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:720px;width:92vw">
        <h2 class="modal-title">Invoice History — ${esc(client.first_name)} ${esc(client.last_name)}</h2>
        <div style="margin-bottom:14px;font-size:13px;color:var(--text-muted)">${esc(client.email)}${client.phone ? ' · ' + esc(client.phone) : ''}</div>
        <div class="table-wrap" style="max-height:420px;overflow-y:auto">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Lead Types</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.length === 0
                ? `<tr><td colspan="5"><div class="empty-state" style="padding:24px 0"><h3>No invoices yet</h3></div></td></tr>`
                : invoices.map(inv => {
                    const types = inv.lead_types ? inv.lead_types.split(',').join(', ') : '—';
                    return `
                      <tr>
                        <td style="color:var(--gold);font-weight:600">${esc(inv.invoice_number)}</td>
                        <td style="color:var(--text-muted)">${formatDate(inv.invoice_date)}</td>
                        <td style="color:var(--text-muted);font-size:13px">${esc(types)}</td>
                        <td style="font-weight:600">${fmtAmt(inv.total_amount)}</td>
                        <td>${inv.paid
                          ? `<span class="badge badge-green">Paid</span>`
                          : `<span class="badge badge-red">Unpaid</span>`
                        }</td>
                      </tr>
                    `;
                  }).join('')
              }
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="closeHistory">Close</button>
          <button class="btn btn-primary" id="newInvoiceFromHistory">New Invoice</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeHistory').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#newInvoiceFromHistory').addEventListener('click', () => {
      overlay.remove();
      window.navigate('create-invoice', { clientId: client.id, clientName: `${client.first_name} ${client.last_name}` });
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }
}

function openClientModal(existing, onSave) {
  const isEdit = !!existing;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2 class="modal-title">${isEdit ? 'Edit Client' : 'Add Client'}</h2>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input class="form-input" id="mFirstName" value="${isEdit ? esc(existing.first_name) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input class="form-input" id="mLastName" value="${isEdit ? esc(existing.last_name) : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="mEmail" type="email" value="${isEdit ? esc(existing.email) : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Phone <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input class="form-input" id="mPhone" value="${isEdit ? esc(existing.phone || '') : ''}">
      </div>
      <div id="formError" style="color:var(--red);font-size:13px;margin-top:-8px;margin-bottom:8px;display:none"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mCancel">Cancel</button>
        <button class="btn btn-primary" id="mSave">${isEdit ? 'Save Changes' : 'Add Client'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#mCancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#mSave').addEventListener('click', async () => {
    const data = {
      firstName: overlay.querySelector('#mFirstName').value.trim(),
      lastName: overlay.querySelector('#mLastName').value.trim(),
      email: overlay.querySelector('#mEmail').value.trim(),
      phone: overlay.querySelector('#mPhone').value.trim(),
    };

    const err = overlay.querySelector('#formError');
    if (!data.firstName || !data.lastName) { err.textContent = 'First and last name are required.'; err.style.display='block'; return; }
    if (!data.email.includes('@')) { err.textContent = 'Please enter a valid email.'; err.style.display='block'; return; }

    if (isEdit) {
      await window.api.db.updateClient(existing.id, data);
    } else {
      await window.api.db.addClient(data);
    }
    overlay.remove();
    await onSave();
    showToast(isEdit ? 'Client updated.' : 'Client added.', 'success');
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
