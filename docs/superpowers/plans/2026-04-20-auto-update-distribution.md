# Auto-Update Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package CFG Invoicing as a macOS DMG, publish releases to GitHub via Actions, and show an in-app modal with release notes when an update is available.

**Architecture:** A GitHub Actions workflow builds a universal DMG on every `v*` tag push and publishes it as a GitHub release. In the main process, `autoUpdater` event listeners forward update state to the renderer via IPC. A new `renderer/updater.js` module injects a styled modal into `index.html` that shows the version, release notes, and Update/Later buttons.

**Tech Stack:** electron-builder 26, electron-updater 6, GitHub Actions, GitHub Releases API

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `.github/workflows/release.yml` | Create | Build + publish DMG on tag push |
| `main.js` | Modify lines 39–43 | Replace `checkForUpdatesAndNotify` with event listeners + IPC handler |
| `preload.js` | Modify lines 55–59 | Expose `onUpdateAvailable`, `onUpdateDownloaded`, `installUpdate` |
| `renderer/updater.js` | Create | Modal HTML injection + button wiring |
| `renderer/index.html` | Modify line 50 | Load `updater.js` before `app.js` |

---

## Task 1: GitHub Actions Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

No unit tests — this is infrastructure. Verified by triggering a tag push after all tasks are done.

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and publish DMG
        run: npm run dist -- --publish always
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
```

`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` prevents electron-builder from failing when no Apple signing certificate is present.

`npm run dist -- --publish always` appends `--publish always` to the existing `electron-builder --mac dmg` script, telling it to upload the artifact to GitHub Releases.

- [ ] **Step 3: Add GitHub personal access token as a repo secret**

1. Go to github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Set name: `cfg-invoicing-releases`
4. Set expiration: No expiration (or 1 year)
5. Under "Repository access": select `Salhani1014/cfg-invoicing`
6. Under "Permissions → Repository permissions": set `Contents` to **Read and write**
7. Click "Generate token" — copy it immediately
8. Go to github.com/Salhani1014/cfg-invoicing → Settings → Secrets and variables → Actions
9. Click "New repository secret"
10. Name: `GH_TOKEN`, Value: paste the token
11. Click "Add secret"

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow"
git push
```

---

## Task 2: main.js — Auto-updater Event Wiring

**Files:**
- Modify: `main.js` lines 39–43

No unit tests — Electron IPC is not unit-testable without a full Electron environment.

- [ ] **Step 1: Replace the existing auto-updater block**

Current code (lines 39–43):
```javascript
  // Auto-updater (checks GitHub releases on launch)
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdatesAndNotify();
  } catch (_) {}
```

Replace with:
```javascript
  // Auto-updater (checks GitHub releases on launch)
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.logger = null;

    autoUpdater.on('update-available', info => {
      mainWindow?.webContents.send('update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes || ''
      });
    });

    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', err => {
      console.error('[updater]', err.message);
    });

    autoUpdater.checkForUpdates();
  } catch (_) {}
```

- [ ] **Step 2: Add the `autoUpdater:install` IPC handler**

Add this line after the existing IPC handlers block (after line ~107, before the `const { generateInvoicePDF ... }` require):

```javascript
ipcMain.handle('autoUpdater:install', () => {
  try { require('electron-updater').autoUpdater.quitAndInstall(); } catch (_) {}
});
```

- [ ] **Step 3: Verify the app still starts**

```bash
npm start
```

Expected: app opens normally, no crash. Console shows `[updater]` only if there's an error (there won't be in dev since the app isn't packaged — `checkForUpdates` returns null silently).

- [ ] **Step 4: Commit**

```bash
git add main.js
git commit -m "feat: wire autoUpdater events to renderer IPC"
git push
```

---

## Task 3: preload.js — Expose Update API

**Files:**
- Modify: `preload.js` lines 55–59 (after the `contractors` block, before the closing `}`  of `exposeInMainWorld`)

No unit tests — preload bridge is verified by the modal working end-to-end.

- [ ] **Step 1: Add three update methods to the contextBridge**

Current end of `preload.js` (lines 55–59):
```javascript
  contractors: {
    exportCsv:        (params) => ipcRenderer.invoke('contractors:exportCsv', params),
    exportSummaryPdf: (params) => ipcRenderer.invoke('contractors:exportSummaryPdf', params),
  },
});
```

Replace with:
```javascript
  contractors: {
    exportCsv:        (params) => ipcRenderer.invoke('contractors:exportCsv', params),
    exportSummaryPdf: (params) => ipcRenderer.invoke('contractors:exportSummaryPdf', params),
  },
  updater: {
    onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
    install: () => ipcRenderer.invoke('autoUpdater:install'),
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add preload.js
git commit -m "feat: expose updater API via contextBridge"
git push
```

---

## Task 4: renderer/updater.js — In-App Update Modal

**Files:**
- Create: `renderer/updater.js`
- Modify: `renderer/index.html` line 50

No unit tests — pure DOM manipulation, verified visually.

- [ ] **Step 1: Create `renderer/updater.js`**

```javascript
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
    status.textContent = 'Downloading update in the background…';
    notes.textContent = typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map(r => r.note || '').join('\n\n')
        : 'No release notes provided.';
    showModal();
  });

  window.api.updater.onUpdateDownloaded(() => {
    status.textContent = 'Download complete — ready to install.';
    installBtn.textContent = 'Restart & Install';
  });

  laterBtn.addEventListener('click', hideModal);

  installBtn.addEventListener('click', () => {
    installBtn.disabled = true;
    installBtn.textContent = 'Restarting…';
    window.api.updater.install();
  });
})();
```

- [ ] **Step 2: Load `updater.js` in `renderer/index.html`**

Current line 50:
```html
  <script src="app.js" type="module"></script>
```

Replace with:
```html
  <script src="updater.js"></script>
  <script src="app.js" type="module"></script>
```

`updater.js` is a plain script (not a module) so it runs immediately after the DOM is ready and before the app router initializes.

- [ ] **Step 3: Verify no console errors**

```bash
npm start
```

Expected: app opens, no console errors. The modal is hidden — it only appears when `autoUpdater` fires `update-available`, which only happens in a packaged build with a newer version available on GitHub Releases.

- [ ] **Step 4: Commit**

```bash
git add renderer/updater.js renderer/index.html
git commit -m "feat: add in-app update modal with release notes"
git push
```

---

## Task 5: Ship v1.0.0 — First Release

This task tags and publishes the first release so both machines can install the packaged app.

- [ ] **Step 1: Bump version to 1.0.0 (already set — confirm)**

```bash
node -e "console.log(require('./package.json').version)"
```

Expected: `1.0.0`

If not 1.0.0, edit `package.json` version field, then:
```bash
git add package.json && git commit -m "chore: set version to 1.0.0" && git push
```

- [ ] **Step 2: Tag and push**

```bash
git tag v1.0.0
git push --tags
```

- [ ] **Step 3: Watch the build**

Go to `github.com/Salhani1014/cfg-invoicing/actions` — a "Release" workflow run will appear. It takes ~5–10 minutes. Wait for the green checkmark.

- [ ] **Step 4: Add release notes**

Go to `github.com/Salhani1014/cfg-invoicing/releases` — a release named `v1.0.0` will have been created automatically. Click "Edit", fill in the release notes (what's in this version), then click "Update release".

- [ ] **Step 5: Install the app**

Download the `.dmg` from the release page. Double-click it, drag CFG Invoicing to Applications. Right-click the app → Open → Open Anyway (one-time Gatekeeper bypass for unsigned app). The app opens and runs normally.

Repeat on Obada's machine.

---

## Shipping Future Updates

Every time you fix a bug or add a feature:

```bash
# 1. Edit package.json version (e.g. 1.0.0 → 1.0.1)
# 2. Commit
git add package.json
git commit -m "chore: bump version to 1.0.1"
git push

# 3. Tag and push — triggers the build
git tag v1.0.1
git push --tags

# 4. Go to GitHub releases, add release notes to the new release
# 5. Both apps show the update popup on next launch
```
