export async function setupScreen(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px">
      <div class="card" style="max-width:460px;width:100%">
        <div style="text-align:center;margin-bottom:28px">
          <h1 style="font-size:22px;font-weight:700;color:var(--gold);margin-bottom:8px">Welcome to CFG Invoicing</h1>
          <p style="color:var(--text-muted);font-size:14px">Set up your identity on this machine. You only need to do this once.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Who are you?</label>
          <select class="form-select" id="setupUser">
            <option value="">Select...</option>
            <option value="braxton">Braxton Mondell</option>
            <option value="obada">Obada</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Gmail App Password</label>
          <input type="password" class="form-input" id="setupSmtpPass" placeholder="xxxx xxxx xxxx xxxx">
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">16-character App Password for your CFG email — not your regular Gmail password.</div>
        </div>

        <div class="form-group">
          <label class="form-label">PDF Save Folder</label>
          <div style="display:flex;gap:8px">
            <input type="text" class="form-input" id="setupFolder" placeholder="Click Browse to select..." readonly style="flex:1;cursor:pointer">
            <button class="btn btn-ghost" id="setupFolderBtn">Browse</button>
          </div>
        </div>

        <div id="setupError" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none"></div>

        <button class="btn btn-primary" id="setupSaveBtn" style="width:100%">Save &amp; Continue</button>
      </div>
    </div>
  `;

  const SMTP_USERS = {
    braxton: 'braxton@checkmatefinancialgroup.com',
    obada: 'obada@checkmatefinancialgroup.com'
  };

  container.querySelector('#setupFolderBtn').addEventListener('click', async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder) container.querySelector('#setupFolder').value = folder;
  });

  container.querySelector('#setupSaveBtn').addEventListener('click', async () => {
    const err = container.querySelector('#setupError');
    err.style.display = 'none';

    const user = container.querySelector('#setupUser').value;
    const smtpPass = container.querySelector('#setupSmtpPass').value.trim();
    const saveFolder = container.querySelector('#setupFolder').value;

    if (!user)       { err.textContent = 'Please select who you are.'; err.style.display = 'block'; return; }
    if (!smtpPass)   { err.textContent = 'Please enter your Gmail App Password.'; err.style.display = 'block'; return; }
    if (!saveFolder) { err.textContent = 'Please select a PDF save folder.'; err.style.display = 'block'; return; }

    await window.api.userConfig.save({ user, smtpUser: SMTP_USERS[user], smtpPass, saveFolder });
    window.navigate('clients');
  });
}
