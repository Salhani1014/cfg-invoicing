export async function clientsScreen(container) {
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
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Last Invoice</th>
              <th>Last Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="clientBody"></tbody>
        </table>
      </div>
    </div>
  `;

  let clients = await window.api.db.getClients();
  renderTable(clients);

  document.getElementById('clientSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = clients.filter(c =>
      `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)
    );
    renderTable(filtered);
  });

  document.getElementById('addClientBtn').addEventListener('click', () => {
    openClientModal(null, async () => {
      clients = await window.api.db.getClients();
      renderTable(clients);
    });
  });

  function getStatus(lastInvoiceDate) {
    if (!lastInvoiceDate) return { label: 'Overdue', cls: 'badge-red' };
    const days = Math.floor((Date.now() - new Date(lastInvoiceDate)) / 86400000);
    if (days < 6) return { label: 'Up to Date', cls: 'badge-green' };
    if (days === 6) return { label: 'Due Soon', cls: 'badge-yellow' };
    return { label: 'Overdue', cls: 'badge-red' };
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatAmount(a) {
    if (!a) return '—';
    return '$' + Number(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderTable(data) {
    const body = document.getElementById('clientBody');
    if (!data.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><h3>No clients yet</h3><p>Add your first client to get started.</p></div></td></tr>`;
      return;
    }
    body.innerHTML = data.map(c => {
      const status = getStatus(c.last_invoice_date);
      return `
        <tr>
          <td><strong>${c.first_name} ${c.last_name}</strong></td>
          <td style="color:var(--text-muted)">${c.email}</td>
          <td style="color:var(--text-muted)">${c.phone}</td>
          <td style="color:var(--text-muted)">${formatDate(c.last_invoice_date)}</td>
          <td>${formatAmount(c.last_invoice_amount)}</td>
          <td><span class="badge ${status.cls}">${status.label}</span></td>
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" data-action="invoice" data-id="${c.id}" data-name="${c.first_name} ${c.last_name}">New Invoice</button>
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
          <input class="form-input" id="mFirstName" value="${isEdit ? existing.first_name : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input class="form-input" id="mLastName" value="${isEdit ? existing.last_name : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="mEmail" type="email" value="${isEdit ? existing.email : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input class="form-input" id="mPhone" value="${isEdit ? existing.phone : ''}">
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
    if (!data.phone) { err.textContent = 'Phone number is required.'; err.style.display='block'; return; }

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

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
