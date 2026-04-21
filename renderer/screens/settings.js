export async function settingsScreen(container) {
  const settings = await window.api.settings.getAll();
  const userCfg = await window.api.userConfig.getConfig() || {};
  const USER_LABELS = { braxton: 'Braxton Mondell', obada: 'Obada' };

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Settings</h1>
    </div>

    <div style="max-width:600px;display:flex;flex-direction:column;gap:20px">

      <div class="card" style="margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:600;margin-bottom:16px;color:var(--gold)">User Settings</h3>
        <div class="form-group">
          <label class="form-label">Current User</label>
          <div style="font-size:14px;font-weight:600;padding:8px 0">${USER_LABELS[userCfg.user] || userCfg.user || '—'}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Gmail App Password</label>
          <input type="password" class="form-input" id="userSmtpPass" value="${esc(userCfg.smtpPass || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">PDF Save Folder</label>
          <div style="display:flex;gap:8px">
            <input type="text" class="form-input" id="userSaveFolder" value="${esc(userCfg.saveFolder || '')}" readonly style="flex:1;cursor:pointer">
            <button class="btn btn-ghost" id="userFolderBtn">Browse</button>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="saveUserSettingsBtn">Save User Settings</button>
        <span id="userSettingsSaved" style="margin-left:12px;color:var(--green);font-size:13px;display:none">Saved!</span>
      </div>

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
          <input class="form-input" id="companyEmail" placeholder="obada@checkmatefinancialgroup.com" value="${esc(settings.companyEmail || '')}">
        </div>
        <button class="btn btn-primary" id="saveCompanyBtn">Save</button>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:600;color:var(--gold);margin-bottom:6px">Overdue Reminders</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Automatically email unpaid clients when their invoice is past due. Runs once each time the app launches.</p>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:16px">
          <input type="checkbox" id="overdueEnabled" ${settings.overdueRemindersEnabled !== 'false' ? 'checked' : ''} style="accent-color:var(--gold);width:16px;height:16px">
          <span style="font-size:14px;font-weight:500">Enable auto-reminders on launch</span>
        </label>
        <div class="form-group" style="max-width:200px">
          <label class="form-label">Send reminder after (days)</label>
          <input class="form-input" id="overdueDays" type="number" min="1" max="90" value="${esc(settings.overdueReminderDays || '7')}">
        </div>
        <button class="btn btn-primary" id="saveReminderBtn">Save Reminder Settings</button>
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
          <label class="form-label">Other</label>
          <input class="form-input" id="paymentOther" placeholder="Venmo, Cash App, etc." value="${esc(settings.paymentOther || '')}">
        </div>
        <button class="btn btn-primary" id="savePaymentBtn">Save Payment Methods</button>
      </div>

    </div>
  `;

  container.querySelector('#userFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder) container.querySelector('#userSaveFolder').value = folder;
  });

  container.querySelector('#saveUserSettingsBtn').addEventListener('click', async () => {
    const smtpPass = container.querySelector('#userSmtpPass').value.trim();
    const saveFolder = container.querySelector('#userSaveFolder').value;
    await window.api.userConfig.save({ ...userCfg, smtpPass, saveFolder });
    const saved = container.querySelector('#userSettingsSaved');
    saved.style.display = 'inline';
    setTimeout(() => { saved.style.display = 'none'; }, 2000);
  });

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
    window.api.shell.openExternal('https://myaccount.google.com/apppasswords');
  });

  document.getElementById('saveEmailBtn').addEventListener('click', async () => {
    showToast('Email settings saved.', 'success');
  });

  document.getElementById('testEmailBtn').addEventListener('click', async () => {
    const status = document.getElementById('emailStatus');
    status.textContent = 'Testing...';
    status.style.color = 'var(--text-muted)';
    try {
      const cfg = await window.api.userConfig.getConfig() || {};
      await window.api.mail.testConnection({
        smtpUser: cfg.user,
        smtpPass: cfg.smtpPass
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

  document.getElementById('saveReminderBtn').addEventListener('click', async () => {
    try {
      await window.api.settings.set('overdueRemindersEnabled', document.getElementById('overdueEnabled').checked ? 'true' : 'false');
      await window.api.settings.set('overdueReminderDays', document.getElementById('overdueDays').value || '7');
      showToast('Reminder settings saved.', 'success');
    } catch (e) {
      showToast('Failed to save.', 'error');
    }
  });

  document.getElementById('savePaymentBtn').addEventListener('click', async () => {
    try {
      await window.api.settings.set('paymentZelle', document.getElementById('paymentZelle').value.trim());
      await window.api.settings.set('paymentBank', document.getElementById('paymentBank').value.trim());
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
