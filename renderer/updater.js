// Polished, multi-step update flow. Steps:
//   1. Changelog — cycling fun-message ticker
//   2. Terms — long absurd ToS, must scroll to bottom + check the box
//   3. Install — click → download with live progress
//   4. Restart — prompt to relaunch
//
// Driven by IPC events from electron-updater (configured with
// autoDownload=false in main.js so the user clicks Install themselves).
(function () {
  // ─── Changelog (cycles through fun messages) ─────────────────────────
  const CHANGES = [
    { emoji: '⏱️', text: 'Time Tracking tab — Live status, Timesheets, Employees, Alerts. Finally.' },
    { emoji: '🔐', text: 'Supabase login on launch. Sleep easier knowing the door is locked.' },
    { emoji: '🐛', text: 'Quashed a particularly stubborn bug. It will be missed by no one.' },
    { emoji: '🎨', text: 'Polished update flow (the thing you\'re looking at right now).' },
    { emoji: '🚀', text: 'Updates feel ~37% more dramatic. We measured this in vibes.' },
    { emoji: '📊', text: 'Live sub-tab refreshes every 5 seconds. Stop refreshing manually.' },
    { emoji: '🤝', text: 'Mismatch alerts now SMS admin if a videographer goes off-WiFi while clocked in.' },
    { emoji: '🔧', text: 'Under-the-hood: 25 commits worth of plumbing you won\'t notice and that\'s the point.' },
  ];

  // ─── Absurd ToS (must scroll to bottom) ──────────────────────────────
  const TOS = `CHECKMATE FINANCIAL GROUP — INVOICING APP
END-USER LICENSE AGREEMENT, VERSION 1.0.5

PLEASE READ CAREFULLY. By clicking "I Agree" below, you affirm that:

1. You will not use CFG Invoicing to develop, design, or assist in the development of nuclear, chemical, or biological weapons.

2. You will not use CFG Invoicing to attempt first contact with extraterrestrial life forms. If first contact is initiated by an extraterrestrial life form, you will politely decline and update CFG Invoicing to the latest version before responding.

3. You acknowledge that if you spill coffee, tea, kombucha, La Croix, or other liquids on your laptop while using this app, the responsibility falls entirely on you and not on the makers of this software, Obada, Braxton, or any electromagnetic spirits residing in the device.

4. You agree that Obada is right at least 87% of the time, and that the remaining 13% is reserved for matters concerning whether or not pineapple belongs on pizza.

5. You will not yell at the app when it is being slow. The app is doing its best. Take a deep breath.

6. In the event of a zombie apocalypse, robot uprising, or particularly aggressive HOA dispute, this license is rendered null and void and you may use CFG Invoicing freely (or, more likely, abandon it).

7. You will not reverse-engineer, decompile, or otherwise attempt to extract the secret recipe for the auto-update modal's flair. It took longer than you'd think.

8. If you discover a bug, you agree to report it via Slack with at least one descriptive emoji. Acceptable: 🐛 🤔 😩. Unacceptable: 👻 (we cannot debug ghosts).

9. You acknowledge that "Quickbooks" is mentioned exactly zero times in this license. Let that sink in.

10. You agree that the app's color scheme is, at minimum, "fine." Strong opinions about the exact hex value of the primary button are out of scope for this license.

11. You will not blame the app for inflation, the housing market, your fantasy football performance, or the weather. Blame Obada instead.

12. You will not use CFG Invoicing while operating heavy machinery, light machinery, medium machinery, or a Segway.

13. You acknowledge that uptime is best-effort. If the app is down, take a walk. The fresh air will do you good.

14. You agree to laugh at least once while reading this license. If you have not laughed yet, please re-read clause 6.

15. You will not use this software to send invoices to fictional people, animals, or sentient houseplants, unless those entities are legally registered as W-9 contractors with the IRS.

16. You agree that backups are important. You will not call Obada at 2:00 AM because you didn't make a backup. He needs his sleep.

17. You acknowledge that the Time Tracking tab is for tracking time. Time, in this context, means the linear progression of moments from the past, through the present, into the future. Other definitions of time, including but not limited to "quality time," "good times," and "the time of your life," are not supported.

18. You will not attempt to clock in from outside the office WiFi. The system will catch you. Don't make it awkward.

19. You agree that Braxton is the videographer. This is a statement of fact, not a contractual obligation, but you agree with it anyway.

20. You acknowledge that you have read this entire license, including this clause, which thanks you for scrolling all the way to the bottom. You're a thorough person and the world needs more of you.

END OF LICENSE.`;

  // ─── Modal scaffold ───────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'updateRoot';
  root.style.cssText = [
    'display:none', 'position:fixed', 'inset:0',
    'background:rgba(0,0,0,0.85)', 'z-index:9999',
    'align-items:center', 'justify-content:center',
    'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
    'animation:updFade 200ms ease-out',
  ].join(';');
  root.innerHTML = `
    <style>
      @keyframes updFade { from { opacity:0 } to { opacity:1 } }
      @keyframes updSlide { from { transform:translateY(8px); opacity:0 } to { transform:translateY(0); opacity:1 } }
      #updCard { background:#1a1a1a; border:1px solid #333; border-radius:14px; padding:0;
        max-width:560px; width:92%; max-height:88vh; overflow:hidden; display:flex; flex-direction:column;
        box-shadow:0 24px 60px rgba(0,0,0,.5); }
      #updHead { padding:20px 24px 8px; }
      #updTitle { font-size:20px; font-weight:700; color:#c9a84c; }
      #updSub { font-size:12px; color:#888; margin-top:4px; }
      #updBody { padding:8px 24px 20px; flex:1; overflow:auto; min-height:0; }
      .upd-change { padding:14px 16px; border-radius:10px; background:#0e0e0e; border:1px solid #2a2a2a;
        display:flex; align-items:flex-start; gap:12px; color:#d8d8d8; font-size:14px; line-height:1.55;
        animation:updSlide 280ms ease-out; }
      .upd-change-emoji { font-size:22px; }
      .upd-dots { display:flex; gap:6px; justify-content:center; margin-top:12px; }
      .upd-dot { width:6px; height:6px; border-radius:9999px; background:#444; }
      .upd-dot.on { background:#c9a84c; }
      #updTos { font-size:12px; line-height:1.7; color:#bbb; background:#0c0c0c; border:1px solid #2a2a2a;
        border-radius:10px; padding:14px; white-space:pre-wrap; max-height:300px; overflow:auto; }
      #updAgree { display:flex; align-items:center; gap:8px; margin-top:12px; color:#888; font-size:13px; }
      #updAgree input { width:16px; height:16px; accent-color:#c9a84c; }
      #updAgree.disabled { opacity:.5; }
      #updFoot { padding:14px 24px 20px; border-top:1px solid #222; display:flex; gap:10px; justify-content:space-between; align-items:center; }
      .upd-btn { padding:10px 22px; border-radius:8px; border:none; font-size:13px; font-weight:600;
        cursor:pointer; transition:opacity 150ms ease; }
      .upd-btn-primary { background:#c9a84c; color:#000; }
      .upd-btn-primary:hover { background:#d4b25a; }
      .upd-btn-primary:disabled { background:#3a3a3a; color:#777; cursor:not-allowed; }
      .upd-btn-ghost { background:transparent; color:#aaa; border:1px solid #444; }
      .upd-btn-ghost:hover { color:#fff; border-color:#666; }
      #updProgress { margin-top:8px; }
      .upd-bar { width:100%; height:8px; background:#222; border-radius:4px; overflow:hidden; }
      .upd-bar > div { height:100%; background:linear-gradient(90deg,#c9a84c,#e6c269); transition:width 200ms ease; }
      .upd-pct { font-size:12px; color:#888; margin-top:6px; text-align:right; font-variant-numeric:tabular-nums; }
      .upd-err { color:#e87979; font-size:12px; margin-top:8px; }
    </style>

    <div id="updCard">
      <div id="updHead">
        <div id="updTitle">🚀 Update available</div>
        <div id="updSub"></div>
      </div>
      <div id="updBody"></div>
      <div id="updFoot">
        <button id="updLater" class="upd-btn upd-btn-ghost">Maybe later</button>
        <button id="updNext" class="upd-btn upd-btn-primary">Next →</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const title = root.querySelector('#updTitle');
  const sub = root.querySelector('#updSub');
  const body = root.querySelector('#updBody');
  const laterBtn = root.querySelector('#updLater');
  const nextBtn = root.querySelector('#updNext');

  let pendingVersion = null;
  let pendingHtmlUrl = null;
  let downloaded = false;
  let step = 'changelog'; // changelog → tos → install → restart
  let changeIdx = 0;
  let cycleTimer = null;
  let scrolledToBottom = false;
  let agreed = false;

  function show() { root.style.display = 'flex'; }
  function hide() { root.style.display = 'none'; clearCycle(); }
  function clearCycle() { if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; } }

  // ─── STEP 1: changelog ticker ────────────────────────────────────────
  function renderChangelog() {
    clearCycle();
    title.textContent = '🚀 Update available';
    sub.textContent = `Version ${pendingVersion || '?'} — here's what's new`;
    body.innerHTML = `
      <div class="upd-change" id="updTicker">
        <div class="upd-change-emoji">${CHANGES[changeIdx].emoji}</div>
        <div>${CHANGES[changeIdx].text}</div>
      </div>
      <div class="upd-dots">
        ${CHANGES.map((_, i) => `<div class="upd-dot ${i === changeIdx ? 'on' : ''}"></div>`).join('')}
      </div>
    `;
    // Force-update mode: no escape from the changelog. The user MUST proceed.
    laterBtn.style.display = 'none';
    nextBtn.textContent = 'See the fine print →';
    nextBtn.disabled = false;

    cycleTimer = setInterval(() => {
      changeIdx = (changeIdx + 1) % CHANGES.length;
      const t = body.querySelector('#updTicker');
      if (!t) return;
      t.style.animation = 'none';
      // force reflow so the animation restarts
      void t.offsetWidth;
      t.style.animation = 'updSlide 280ms ease-out';
      t.querySelector('.upd-change-emoji').textContent = CHANGES[changeIdx].emoji;
      t.querySelector('div:last-child').textContent = CHANGES[changeIdx].text;
      body.querySelectorAll('.upd-dot').forEach((d, i) =>
        d.classList.toggle('on', i === changeIdx)
      );
    }, 3000);
  }

  // ─── STEP 2: ToS with scroll-gate + agree checkbox ───────────────────
  function renderTos() {
    clearCycle();
    title.textContent = '📜 The fine print';
    sub.textContent = 'Scroll to the bottom and tick the box to continue';
    body.innerHTML = `
      <div id="updTos">${TOS}</div>
      <label id="updAgree" class="disabled">
        <input type="checkbox" id="updAgreeBox" disabled />
        I have read, understood, and accept these absurd terms.
      </label>
    `;
    // Back navigates within the flow (to changelog), NOT a way to escape.
    laterBtn.style.display = '';
    laterBtn.textContent = '← Back';
    nextBtn.textContent = 'Install';
    nextBtn.disabled = true;

    const tos = body.querySelector('#updTos');
    const label = body.querySelector('#updAgree');
    const box = body.querySelector('#updAgreeBox');

    tos.addEventListener('scroll', () => {
      const atBottom = tos.scrollTop + tos.clientHeight >= tos.scrollHeight - 4;
      if (atBottom && !scrolledToBottom) {
        scrolledToBottom = true;
        box.disabled = false;
        label.classList.remove('disabled');
        label.style.color = '#ddd';
      }
    });
    box.addEventListener('change', () => {
      agreed = box.checked;
      nextBtn.disabled = !agreed;
    });
  }

  // ─── STEP 3: install with live progress ──────────────────────────────
  function renderInstall() {
    clearCycle();
    title.textContent = '⬇️ Downloading update';
    sub.textContent = 'Hang tight — installing the polished version of polish';
    body.innerHTML = `
      <div class="upd-change">
        <div class="upd-change-emoji">📦</div>
        <div>Pulling v${pendingVersion} from GitHub. This is usually quick — under 30 seconds on a decent connection.</div>
      </div>
      <div id="updProgress">
        <div class="upd-bar"><div id="updFill" style="width:0%"></div></div>
        <div class="upd-pct" id="updPct">0%</div>
      </div>
    `;
    laterBtn.style.display = 'none';
    nextBtn.disabled = true;
    nextBtn.textContent = 'Downloading…';

    window.api.updater.download();
  }

  function updateProgress(p) {
    const fill = body.querySelector('#updFill');
    const pct = body.querySelector('#updPct');
    if (!fill || !pct) return;
    const v = Math.max(0, Math.min(100, p.percent || 0));
    fill.style.width = v.toFixed(1) + '%';
    pct.textContent = `${v.toFixed(0)}% — ${(p.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  }

  // ─── STEP 4: restart ─────────────────────────────────────────────────
  function renderRestart() {
    clearCycle();
    title.textContent = '🎉 Ready to restart';
    sub.textContent = `v${pendingVersion} is installed — relaunch required`;
    body.innerHTML = `
      <div class="upd-change">
        <div class="upd-change-emoji">✅</div>
        <div>Download complete. Restart now — you can't keep using the old version. Your work is saved.</div>
      </div>
    `;
    // Force-update mode: no defer button.
    laterBtn.style.display = 'none';
    nextBtn.textContent = 'Restart now';
    nextBtn.disabled = false;
  }

  function renderError(msg) {
    clearCycle();
    title.textContent = '⚠️ Auto-install hit a snag';
    sub.textContent = `v${pendingVersion} couldn't install automatically — manual download is required`;
    body.innerHTML = `
      <div class="upd-change">
        <div class="upd-change-emoji">🙃</div>
        <div>${msg || 'Unknown error.'} ${
          pendingHtmlUrl
            ? `Click below to open the release page in your browser — download the DMG, drag it into Applications (replace the old one), and relaunch.`
            : 'Try again, or relaunch the app.'
        }</div>
      </div>
    `;
    laterBtn.style.display = 'none';
    nextBtn.textContent = pendingHtmlUrl ? 'Open download page' : 'Try again';
    nextBtn.disabled = false;
  }

  // ─── Button wiring ───────────────────────────────────────────────────
  // No path hides the modal. "Back" only navigates within the flow.
  laterBtn.addEventListener('click', () => {
    if (step === 'tos') { step = 'changelog'; renderChangelog(); return; }
  });
  nextBtn.addEventListener('click', () => {
    if (step === 'changelog') { step = 'tos'; renderTos(); return; }
    if (step === 'tos') {
      if (!agreed) return;
      step = 'install';
      renderInstall();
      return;
    }
    if (step === 'restart') {
      nextBtn.disabled = true;
      nextBtn.textContent = 'Restarting…';
      window.api.updater.install();
      return;
    }
    // Error step: if we have a fallback URL, open it. Otherwise retry.
    if (pendingHtmlUrl && window.api?.shell?.openExternal) {
      window.api.shell.openExternal(pendingHtmlUrl);
      return;
    }
    step = 'install';
    renderInstall();
  });

  // ─── IPC events ──────────────────────────────────────────────────────
  window.api.updater.onUpdateAvailable(info => {
    // Periodic check may re-fire while modal is already open — ignore
    // duplicates so we don't reset the user's scroll-progress / agree state
    // mid-read.
    if (root.style.display === 'flex' && pendingVersion === info.version) return;
    pendingVersion = info.version;
    pendingHtmlUrl = info.htmlUrl || `https://github.com/Salhani1014/cfg-invoicing/releases/tag/v${info.version}`;
    step = 'changelog';
    changeIdx = 0;
    scrolledToBottom = false;
    agreed = false;
    downloaded = false;
    renderChangelog();
    show();
  });
  window.api.updater.onDownloadProgress(p => {
    if (step === 'install') updateProgress(p);
  });
  window.api.updater.onUpdateDownloaded(() => {
    downloaded = true;
    step = 'restart';
    renderRestart();
  });
  window.api.updater.onError(msg => {
    if (step === 'install' || step === 'restart') renderError(msg);
  });
})();
