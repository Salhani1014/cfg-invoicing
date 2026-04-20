export async function settingsScreen(container) {
  const settings = await window.api.settings.getAll();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    <div style="max-width:600px;display:flex;flex-direction:column;gap:20px">

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Invoice Save Folder</h3>
        <div style="display:flex;gap:10px;align-items:center">
          <input class="form-input" id="saveFolder" readonly value="${esc(settings.saveFolder || '')}" placeholder="No folder selected" style="flex:1;cursor:default">
          <button class="btn btn-ghost" id="chooseFolderBtn">Choose Folder</button>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Email Configuration</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Use a Gmail App Password. <a href="#" id="appPassHelp" style="color:var(--gold)">How to create one</a></p>
        <div class="form-group">
          <label class="form-label">Gmail Address</label>
          <input class="form-input" id="smtpUser" type="email" placeholder="fuegoleadz@gmail.com" value="${esc(settings.smtpUser || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">App Password</label>
          <input class="form-input" id="smtpPass" type="password" placeholder="xxxx xxxx xxxx xxxx" value="${esc(settings.smtpPass || '')}">
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn btn-primary" id="saveEmailBtn">Save Email Settings</button>
          <button class="btn btn-ghost" id="testEmailBtn">Test Connection</button>
          <span id="emailStatus" style="font-size:13px"></span>
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Company Email (shown on invoice)</h3>
        <div class="form-group">
          <label class="form-label">Company Email</label>
          <input class="form-input" id="companyEmail" placeholder="info@fuegoleadz.com" value="${esc(settings.companyEmail || '')}">
        </div>
        <button class="btn btn-primary" id="saveCompanyBtn">Save</button>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:18px">Payment Methods (shown on invoice)</h3>
        <div class="form-group">
          <label class="form-label">Zelle</label>
          <input class="form-input" id="paymentZelle" placeholder="Phone number or email" value="${esc(settings.paymentZelle || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Bank Transfer</label>
          <input class="form-input" id="paymentBank" placeholder="Bank name, Account #, Routing #" value="${esc(settings.paymentBank || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">PayPal</label>
          <input class="form-input" id="paymentPaypal" placeholder="PayPal email or link" value="${esc(settings.paymentPaypal || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Other</label>
          <input class="form-input" id="paymentOther" placeholder="Venmo, Cash App, etc." value="${esc(settings.paymentOther || '')}">
        </div>
        <button class="btn btn-primary" id="savePaymentBtn">Save Payment Methods</button>
      </div>

    </div>
  `;

  document.getElementById('chooseFolderBtn').addEventListener('click', async () => {
    try {
      const folder = await window.api.dialog.selectFolder();
      if (folder) {
        document.getElementById('saveFolder').value = folder;
        await window.api.settings.set('saveFolder', folder);
        showToast('Save folder updated.', 'success');
      }
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
  });

  document.getElementById('appPassHelp').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.shell.openPath('https://myaccount.google.com/apppasswords');
  });

  document.getElementById('saveEmailBtn').addEventListener('click', async () => {
    try {
      await window.api.settings.set('smtpUser', document.getElementById('smtpUser').value.trim());
      await window.api.settings.set('smtpPass', document.getElementById('smtpPass').value.trim());
      showToast('Email settings saved.', 'success');
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
  });

  document.getElementById('testEmailBtn').addEventListener('click', async () => {
    const status = document.getElementById('emailStatus');
    status.textContent = 'Testing...';
    status.style.color = 'var(--text-muted)';
    try {
      await window.api.mail.testConnection({
        smtpUser: document.getElementById('smtpUser').value.trim(),
        smtpPass: document.getElementById('smtpPass').value.trim()
      });
      status.textContent = '✓ Connected';
      status.style.color = 'var(--green)';
    } catch (e) {
      status.textContent = '✗ Failed — check credentials';
      status.style.color = 'var(--red)';
    }
  });

  document.getElementById('saveCompanyBtn').addEventListener('click', async () => {
    try {
      await window.api.settings.set('companyEmail', document.getElementById('companyEmail').value.trim());
      showToast('Saved.', 'success');
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
  });

  document.getElementById('savePaymentBtn').addEventListener('click', async () => {
    try {
      await window.api.settings.set('paymentZelle', document.getElementById('paymentZelle').value.trim());
      await window.api.settings.set('paymentBank', document.getElementById('paymentBank').value.trim());
      await window.api.settings.set('paymentPaypal', document.getElementById('paymentPaypal').value.trim());
      await window.api.settings.set('paymentOther', document.getElementById('paymentOther').value.trim());
      showToast('Payment methods saved.', 'success');
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
  });
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
