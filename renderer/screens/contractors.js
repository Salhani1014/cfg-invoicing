const PAYMENT_METHODS = [
  { key: 'paymentZelle', label: 'Zelle' },
  { key: 'paymentBank', label: 'Bank Transfer' },
  { key: 'paymentOther', label: 'Other' },
];

const TAX_CLASSIFICATIONS = [
  'Individual / Sole Proprietor',
  'LLC',
  'S-Corp',
  'C-Corp',
  'Partnership',
];

export async function contractorsScreen(container) {
  let contractors = await window.api.db.getContractors();

  function renderScreen() {
    const year = new Date().getFullYear();
    container.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
        <h1 class="page-title">Contractors</h1>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" id="toggleExportBtn">Export Payments</button>
          <button class="btn btn-primary" id="toggleAddBtn">+ Add Contractor</button>
        </div>
      </div>

      <div id="exportPanel" style="display:none;margin-bottom:20px" class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--gold)">Export Payments</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Year</label>
            <select class="form-select" id="exportYear">
              ${[year, year-1, year-2].map(y => `<option value="${y}">${y}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Contractor</label>
            <select class="form-select" id="exportContractor">
              <option value="">All Contractors</option>
              ${contractors.map(c => `<option value="${esc(c.id)}">${esc(c.legal_name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Date Start (optional)</label>
            <input type="date" class="form-input" id="exportDateStart">
          </div>
          <div>
            <label class="form-label">Date End (optional)</label>
            <input type="date" class="form-input" id="exportDateEnd">
          </div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-primary" id="exportCsvBtn">Export CSV</button>
          <button class="btn btn-ghost" id="exportPdfBtn">Year-End Summary PDF</button>
        </div>
      </div>

      <div id="addContractorPanel" style="display:none;margin-bottom:20px" class="card">
        <h3 style="font-size:14px;font-weight:600;margin-bottom:14px;color:var(--gold)">New Contractor</h3>
        ${renderContractorForm(null, 'add')}
      </div>

      <div id="contractorList">
        ${contractors.length === 0
          ? '<div class="empty-state"><h3>No contractors yet</h3><p>Add a contractor to get started.</p></div>'
          : contractors.map((c, idx) => renderContractorCard(c, idx)).join('')
        }
      </div>
    `;
    wireEvents();
  }

  function renderContractorCard(c, idx) {
    const ytd = Number(c.ytd_total || 0);
    const needsFlag = ytd >= 600;
    return `
      <div class="card" style="margin-bottom:12px" id="card${idx}">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <strong>${esc(c.legal_name)}</strong>
            <span style="color:var(--text-muted);font-size:13px;margin-left:8px">${esc(c.email)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            ${c.w9_on_file
              ? `<span style="background:var(--gold-dim,rgba(201,168,76,0.15));color:var(--gold);font-size:11px;padding:2px 8px;border-radius:10px">W-9 ✓</span>`
              : `<span style="border:1px solid var(--border);color:var(--text-muted);font-size:11px;padding:2px 8px;border-radius:10px">W-9 pending</span>`}
            <span style="font-size:13px;${needsFlag ? 'color:var(--gold);font-weight:600' : 'color:var(--text-muted)'}">
              $${Number(ytd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} YTD${needsFlag ? ' ⚠' : ''}
            </span>
            <button class="btn btn-primary btn-sm" data-action="log" data-idx="${idx}">Log Payment</button>
            <button class="btn btn-ghost btn-sm" data-action="history" data-idx="${idx}">History</button>
            <button class="btn btn-ghost btn-sm" data-action="edit" data-idx="${idx}">Edit</button>
          </div>
        </div>

        <div id="logPaymentSection${idx}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          ${renderLogPaymentForm(c, idx)}
        </div>
        <div id="historySection${idx}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          <div style="color:var(--text-muted);font-size:13px">Loading...</div>
        </div>
        <div id="editSection${idx}" style="display:none;margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
          ${renderContractorForm(c, `edit${idx}`)}
        </div>
      </div>
    `;
  }

  function renderLogPaymentForm(c, idx, prefill = null) {
    const today = new Date().toISOString().split('T')[0];
    return `
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--gold);margin-bottom:14px">
          ${prefill ? 'Edit Payment' : 'Log Payment'} — ${esc(c.legal_name)}
        </div>
        <input type="hidden" id="editPaymentId${idx}" value="${prefill ? esc(prefill.id) : ''}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Pay Date</label>
            <input type="date" class="form-input" id="payDate${idx}" value="${prefill ? esc(prefill.pay_date) : today}">
          </div>
          <div>
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="payMethod${idx}">
              ${PAYMENT_METHODS.map(pm => `<option value="${pm.key}" ${prefill?.payment_method === pm.key ? 'selected' : ''}>${pm.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Hours Worked</label>
            <input type="number" class="form-input" id="payHours${idx}" min="0" step="0.25" placeholder="e.g. 8.5" value="${prefill ? prefill.hours : ''}">
          </div>
          <div>
            <label class="form-label">Hourly Rate ($)</label>
            <input type="number" class="form-input" id="payRate${idx}" min="0" step="0.01" placeholder="e.g. 25.00" value="${prefill ? prefill.hourly_rate : ''}">
          </div>
        </div>
        <div style="background:var(--dark,#111);border:1px solid var(--border);border-radius:6px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--text-muted)">Total</span>
          <span style="font-size:18px;font-weight:700;color:var(--gold)" id="payTotal${idx}">$0.00</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Pay Period Start (optional)</label>
            <input type="date" class="form-input" id="payPeriodStart${idx}" value="${prefill?.pay_period_start || ''}">
          </div>
          <div>
            <label class="form-label">Pay Period End (optional)</label>
            <input type="date" class="form-input" id="payPeriodEnd${idx}" value="${prefill?.pay_period_end || ''}">
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label class="form-label">Description</label>
          <textarea class="form-input" id="payDesc${idx}" rows="2" placeholder="e.g. Lead generation calls — week of Apr 14" style="resize:vertical">${prefill ? esc(prefill.description) : ''}</textarea>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <input type="checkbox" id="payRecurring${idx}" style="accent-color:var(--gold);width:14px;height:14px" ${prefill?.recurring ? 'checked' : ''}>
          <label for="payRecurring${idx}" style="font-size:13px;color:var(--text-muted);cursor:pointer">Recurring payment</label>
        </div>
        <div style="display:flex;gap:8px">
          ${!prefill ? `<button class="btn btn-primary" data-action="generateSend" data-idx="${idx}" data-cid="${esc(c.id)}">Generate &amp; Send Pay Stub</button>
          <button class="btn btn-ghost" data-action="generateOnly" data-idx="${idx}" data-cid="${esc(c.id)}">Generate Only</button>` : ''}
          ${prefill ? `<button class="btn btn-primary" data-action="saveEditPayment" data-idx="${idx}" data-pid="${esc(prefill.id)}">Save Changes</button>` : ''}
          <button class="btn btn-ghost" data-action="cancelLog" data-idx="${idx}">Cancel</button>
        </div>
      </div>
    `;
  }

  function renderContractorForm(c, formId) {
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="grid-column:1/-1">
          <label class="form-label">Legal Name <span style="color:var(--red)">*</span></label>
          <input type="text" class="form-input" id="cfLegalName_${formId}" placeholder="As it appears on W-9" value="${c ? esc(c.legal_name) : ''}">
        </div>
        <div>
          <label class="form-label">Email <span style="color:var(--red)">*</span></label>
          <input type="email" class="form-input" id="cfEmail_${formId}" value="${c ? esc(c.email) : ''}">
        </div>
        <div>
          <label class="form-label">Phone</label>
          <input type="tel" class="form-input" id="cfPhone_${formId}" value="${c ? esc(c.phone || '') : ''}">
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label">Street Address <span style="color:var(--red)">*</span></label>
          <input type="text" class="form-input" id="cfAddress_${formId}" value="${c ? esc(c.address) : ''}">
        </div>
        <div>
          <label class="form-label">City <span style="color:var(--red)">*</span></label>
          <input type="text" class="form-input" id="cfCity_${formId}" value="${c ? esc(c.city) : ''}">
        </div>
        <div style="display:grid;grid-template-columns:80px 1fr;gap:8px">
          <div>
            <label class="form-label">State <span style="color:var(--red)">*</span></label>
            <input type="text" class="form-input" id="cfState_${formId}" maxlength="2" placeholder="FL" value="${c ? esc(c.state) : ''}">
          </div>
          <div>
            <label class="form-label">ZIP <span style="color:var(--red)">*</span></label>
            <input type="text" class="form-input" id="cfZip_${formId}" value="${c ? esc(c.zip) : ''}">
          </div>
        </div>
        <div>
          <label class="form-label">Tax ID (SSN or EIN) <span style="color:var(--red)">*</span></label>
          <input type="text" class="form-input" id="cfTaxId_${formId}" placeholder="XXX-XX-XXXX or XX-XXXXXXX" value="${c ? esc(c.tax_id) : ''}">
        </div>
        <div>
          <label class="form-label">Tax Classification <span style="color:var(--red)">*</span></label>
          <select class="form-select" id="cfTaxClass_${formId}">
            ${TAX_CLASSIFICATIONS.map(t => `<option value="${t}" ${c?.tax_classification === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="cfW9_${formId}" style="accent-color:var(--gold);width:14px;height:14px" ${c?.w9_on_file ? 'checked' : ''}>
          <label for="cfW9_${formId}" style="font-size:13px;cursor:pointer">W-9 on file</label>
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label">Notes</label>
          <textarea class="form-input" id="cfNotes_${formId}" rows="2" style="resize:vertical">${c ? esc(c.notes || '') : ''}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        ${formId === 'add'
          ? `<button class="btn btn-primary" id="saveAddContractorBtn">Add Contractor</button>
             <button class="btn btn-ghost" id="cancelAddContractorBtn">Cancel</button>`
          : `<button class="btn btn-primary" data-action="saveEdit" data-formid="${formId}">Save</button>
             <button class="btn btn-ghost" data-action="cancelEdit" data-formid="${formId}">Cancel</button>
             <button class="btn btn-ghost" data-action="deleteContractor" data-formid="${formId}" style="margin-left:auto;color:var(--red)">Delete</button>`
        }
      </div>
    `;
  }

  function readContractorForm(formId) {
    const g = id => document.getElementById(`${id}_${formId}`)?.value?.trim() || '';
    const checked = id => document.getElementById(`${id}_${formId}`)?.checked || false;
    return {
      legalName: g('cfLegalName'), email: g('cfEmail'), phone: g('cfPhone'),
      address: g('cfAddress'), city: g('cfCity'), state: g('cfState'), zip: g('cfZip'),
      taxId: g('cfTaxId'), taxClassification: g('cfTaxClass'),
      w9OnFile: checked('cfW9'), notes: g('cfNotes')
    };
  }

  function readPaymentForm(idx) {
    const g = id => document.getElementById(`${id}${idx}`)?.value?.trim() || '';
    const checked = id => document.getElementById(`${id}${idx}`)?.checked || false;
    const hours = Number(g('payHours')) || 0;
    const rate = Number(g('payRate')) || 0;
    return {
      payDate: g('payDate'),
      paymentMethod: document.getElementById(`payMethod${idx}`)?.value || 'paymentZelle',
      hours, hourlyRate: rate, totalAmount: hours * rate,
      payPeriodStart: g('payPeriodStart') || null,
      payPeriodEnd: g('payPeriodEnd') || null,
      description: g('payDesc'),
      recurring: checked('payRecurring')
    };
  }

  async function loadHistory(c, idx) {
    const section = document.getElementById(`historySection${idx}`);
    const payments = await window.api.db.getContractorPayments(c.id);
    const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ytd = payments.reduce((s, p) => s + Number(p.total_amount), 0);

    if (!payments.length) {
      section.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No payments yet.</div>';
      return;
    }

    section.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Payment History</div>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
        <div style="display:grid;grid-template-columns:90px 1fr 60px 60px 90px 80px;gap:6px;padding:8px 12px;background:var(--dark,#111);font-size:10px;color:var(--text-muted);text-transform:uppercase">
          <span>Date</span><span>Description</span><span style="text-align:center">Hrs</span><span style="text-align:right">Rate</span><span style="text-align:right">Total</span><span style="text-align:center">Actions</span>
        </div>
        ${payments.map(p => `
          <div style="display:grid;grid-template-columns:90px 1fr 60px 60px 90px 80px;gap:6px;padding:10px 12px;border-top:1px solid var(--border);align-items:center;font-size:12px">
            <span style="color:var(--text-muted)">${esc(p.pay_date)}</span>
            <span title="${esc(p.description)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.description)}</span>
            <span style="text-align:center;color:var(--text-muted)">${esc(String(p.hours))}</span>
            <span style="text-align:right;color:var(--text-muted)">$${esc(String(p.hourly_rate))}</span>
            <span style="text-align:right;font-weight:600">${fmt(p.total_amount)}</span>
            <div style="display:flex;gap:4px;justify-content:center">
              <button class="btn btn-ghost" style="padding:2px 7px;font-size:11px" data-action="editPayment" data-idx="${idx}" data-pid="${esc(p.id)}" data-pdata="${esc(JSON.stringify(p))}">Edit</button>
              ${p.pdf_path ? `<button class="btn btn-ghost" style="padding:2px 7px;font-size:11px" data-action="downloadStub" data-path="${esc(p.pdf_path)}">↓</button>` : ''}
            </div>
          </div>
        `).join('')}
        <div style="display:grid;grid-template-columns:90px 1fr 60px 60px 90px 80px;gap:6px;padding:10px 12px;border-top:1px solid var(--border);background:var(--dark,#111)">
          <span style="color:var(--text-muted);font-size:12px;grid-column:1/5;text-align:right">Total Paid (All Time)</span>
          <span style="text-align:right;font-weight:700;color:var(--gold)">${fmt(ytd)}</span>
          <span></span>
        </div>
      </div>
    `;

    section.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'downloadStub') {
          await window.api.shell.openPath(btn.dataset.path);
        } else if (action === 'editPayment') {
          const pData = JSON.parse(btn.dataset.pdata);
          const logSection = document.getElementById(`logPaymentSection${idx}`);
          logSection.innerHTML = renderLogPaymentForm(c, idx, pData);
          logSection.style.display = 'block';
          wirePaymentFormEvents(c, idx);
        }
      });
    });
  }

  function wirePaymentFormEvents(c, idx) {
    const hoursEl = document.getElementById(`payHours${idx}`);
    const rateEl = document.getElementById(`payRate${idx}`);
    const totalEl = document.getElementById(`payTotal${idx}`);
    const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function updateTotal() {
      const total = (Number(hoursEl?.value) || 0) * (Number(rateEl?.value) || 0);
      if (totalEl) totalEl.textContent = fmt(total);
    }
    hoursEl?.addEventListener('input', updateTotal);
    rateEl?.addEventListener('input', updateTotal);
    updateTotal();
  }

  async function runGeneratePayStub(c, idx, sendEmail) {
    const userCfg = await window.api.userConfig.getConfig();
    if (!userCfg?.saveFolder) {
      showToast('Save folder not configured. Go to Settings to set it up.', 'error');
      return;
    }
    const payment = readPaymentForm(idx);
    if (!payment.payDate) { showToast('Pay date is required.', 'error'); return; }
    if (!payment.hours || payment.hours <= 0) { showToast('Hours must be greater than 0.', 'error'); return; }
    if (!payment.hourlyRate || payment.hourlyRate <= 0) { showToast('Hourly rate must be greater than 0.', 'error'); return; }
    if (!payment.description) { showToast('Description is required.', 'error'); return; }

    const btn = document.querySelector(`[data-action="${sendEmail ? 'generateSend' : 'generateOnly'}"][data-idx="${idx}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
      await window.api.pdf.generatePayStub({
        contractor: c, payment, saveFolder: userCfg.saveFolder, sendEmail
      });
      showToast(sendEmail ? 'Pay stub generated and sent!' : 'Pay stub generated!', 'success');
      document.getElementById(`logPaymentSection${idx}`).style.display = 'none';
      contractors = await window.api.db.getContractors();
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = sendEmail ? 'Generate & Send Pay Stub' : 'Generate Only'; }
    }
  }

  function wireEvents() {
    document.getElementById('toggleExportBtn').addEventListener('click', () => {
      const panel = document.getElementById('exportPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('toggleAddBtn').addEventListener('click', () => {
      const panel = document.getElementById('addContractorPanel');
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('cancelAddContractorBtn')?.addEventListener('click', () => {
      document.getElementById('addContractorPanel').style.display = 'none';
    });

    document.getElementById('saveAddContractorBtn')?.addEventListener('click', async () => {
      const data = readContractorForm('add');
      if (!data.legalName || !data.email || !data.address || !data.city || !data.state || !data.zip || !data.taxId) {
        showToast('Please fill in all required fields.', 'error'); return;
      }
      try {
        await window.api.db.addContractor(data);
        showToast('Contractor added.', 'success');
        contractors = await window.api.db.getContractors();
        renderScreen();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    document.getElementById('exportCsvBtn')?.addEventListener('click', async () => {
      const params = {
        year: document.getElementById('exportYear').value,
        contractorId: document.getElementById('exportContractor').value || null,
        dateStart: document.getElementById('exportDateStart').value || null,
        dateEnd: document.getElementById('exportDateEnd').value || null
      };
      try {
        await window.api.contractors.exportCsv(params);
        showToast('CSV exported.', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    document.getElementById('exportPdfBtn')?.addEventListener('click', async () => {
      const params = {
        year: document.getElementById('exportYear').value,
        contractorId: document.getElementById('exportContractor').value || null,
        dateStart: document.getElementById('exportDateStart').value || null,
        dateEnd: document.getElementById('exportDateEnd').value || null
      };
      try {
        await window.api.contractors.exportSummaryPdf(params);
        showToast('Year-end summary PDF generated.', 'success');
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    document.getElementById('contractorList').addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx = btn.dataset.idx !== undefined ? Number(btn.dataset.idx) : null;
      const c = idx !== null ? contractors[idx] : null;

      if (action === 'log') {
        const sec = document.getElementById(`logPaymentSection${idx}`);
        const isOpen = sec.style.display !== 'none';
        document.getElementById(`historySection${idx}`).style.display = 'none';
        document.getElementById(`editSection${idx}`).style.display = 'none';
        if (isOpen) {
          sec.style.display = 'none';
        } else {
          sec.innerHTML = renderLogPaymentForm(c, idx);
          sec.style.display = 'block';
          wirePaymentFormEvents(c, idx);
        }

      } else if (action === 'history') {
        const sec = document.getElementById(`historySection${idx}`);
        const isOpen = sec.style.display !== 'none';
        document.getElementById(`logPaymentSection${idx}`).style.display = 'none';
        document.getElementById(`editSection${idx}`).style.display = 'none';
        if (!isOpen) { sec.style.display = 'block'; await loadHistory(c, idx); }
        else sec.style.display = 'none';

      } else if (action === 'edit') {
        const sec = document.getElementById(`editSection${idx}`);
        const isOpen = sec.style.display !== 'none';
        document.getElementById(`logPaymentSection${idx}`).style.display = 'none';
        document.getElementById(`historySection${idx}`).style.display = 'none';
        sec.style.display = isOpen ? 'none' : 'block';

      } else if (action === 'generateSend') {
        await runGeneratePayStub(c, idx, true);
      } else if (action === 'generateOnly') {
        await runGeneratePayStub(c, idx, false);

      } else if (action === 'cancelLog') {
        document.getElementById(`logPaymentSection${idx}`).style.display = 'none';

      } else if (action === 'saveEdit') {
        const formId = btn.dataset.formid;
        const data = readContractorForm(formId);
        if (!data.legalName || !data.email || !data.address || !data.city || !data.state || !data.zip || !data.taxId) {
          showToast('Please fill in all required fields.', 'error'); return;
        }
        try {
          await window.api.db.updateContractor(c.id, data);
          showToast('Contractor updated.', 'success');
          contractors = await window.api.db.getContractors();
          renderScreen();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }

      } else if (action === 'cancelEdit') {
        document.getElementById(`editSection${idx}`).style.display = 'none';

      } else if (action === 'deleteContractor') {
        if (!confirm(`Delete ${c.legal_name}? This cannot be undone.`)) return;
        try {
          await window.api.db.deleteContractor(c.id);
          showToast('Contractor deleted.', 'success');
          contractors = await window.api.db.getContractors();
          renderScreen();
        } catch (err) {
          showToast(err.message, 'error');
        }

      } else if (action === 'saveEditPayment') {
        const pid = btn.dataset.pid;
        const data = readPaymentForm(idx);
        if (!data.payDate || !data.hours || !data.hourlyRate || !data.description) {
          showToast('All payment fields are required.', 'error'); return;
        }
        try {
          await window.api.db.updateContractorPayment(pid, data);
          showToast('Payment updated.', 'success');
          document.getElementById(`logPaymentSection${idx}`).style.display = 'none';
          const histSec = document.getElementById(`historySection${idx}`);
          if (histSec.style.display !== 'none') await loadHistory(c, idx);
          contractors = await window.api.db.getContractors();
          renderScreen();
        } catch (err) {
          showToast('Error: ' + err.message, 'error');
        }
      }
    });
  }

  renderScreen();
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
