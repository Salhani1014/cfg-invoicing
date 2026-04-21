(function () {
  const modal = document.createElement('div');
  modal.id = 'updateModal';
  modal.style.cssText = [
    'display:none', 'position:fixed', 'inset:0',
    'background:rgba(0,0,0,0.75)', 'z-index:9999',
    'align-items:center', 'justify-content:center'
  ].join(';');

  modal.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:28px;max-width:480px;width:90%;display:flex;flex-direction:column;gap:14px">
      <div>
        <div id="updateTitle" style="font-size:16px;font-weight:700;color:#c9a84c;margin-bottom:4px"></div>
        <div id="updateStatus" style="font-size:12px;color:#888"></div>
      </div>
      <div id="updateNotes" style="font-size:12px;color:#ccc;background:#111;border:1px solid #333;border-radius:6px;padding:12px;overflow-y:auto;max-height:200px;white-space:pre-wrap;line-height:1.6"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="updateLaterBtn" style="padding:8px 18px;border-radius:6px;border:1px solid #444;background:transparent;color:#ccc;cursor:pointer;font-size:13px">Later</button>
        <button id="updateInstallBtn" style="padding:8px 18px;border-radius:6px;border:none;background:#c9a84c;color:#000;cursor:pointer;font-size:13px;font-weight:600">Update &amp; Restart</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const title = document.getElementById('updateTitle');
  const status = document.getElementById('updateStatus');
  const notes = document.getElementById('updateNotes');
  const laterBtn = document.getElementById('updateLaterBtn');
  const installBtn = document.getElementById('updateInstallBtn');

  function showModal() {
    modal.style.display = 'flex';
  }

  function hideModal() {
    modal.style.display = 'none';
  }

  window.api.updater.onUpdateAvailable(info => {
    title.textContent = `Update Available — v${info.version}`;
    status.textContent = 'Downloading update in the background\u2026';
    notes.textContent = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map(r => r.note || '').join('\n\n')
        : 'No release notes provided.';
    showModal();
  });

  window.api.updater.onUpdateDownloaded(() => {
    status.textContent = 'Download complete \u2014 ready to install.';
    installBtn.textContent = 'Restart & Install';
  });

  laterBtn.addEventListener('click', hideModal);

  installBtn.addEventListener('click', () => {
    installBtn.disabled = true;
    installBtn.textContent = 'Restarting\u2026';
    window.api.updater.install();
  });
})();