# Auto-Update Distribution Design

**Goal:** Package CFG Invoicing as a macOS DMG, publish releases to GitHub, and show an in-app popup with release notes when an update is available.

**Architecture:** GitHub Actions builds a universal macOS DMG on every version tag push and publishes it as a GitHub release. `electron-updater` checks for updates on launch and sends a message to the renderer when one is found. The renderer shows a custom modal with the release notes and Update/Later buttons.

**Tech Stack:** electron-builder (already installed), electron-updater (already installed), GitHub Actions, GitHub Releases

---

## Section 1 — GitHub Repo

- Repo: `github.com/Salhani1014/cfg-invoicing` (private, already created and pushed)
- `package.json` publish config already updated to `owner: "Salhani1014"`, `repo: "cfg-invoicing"`

## Section 2 — GitHub Actions Workflow

File: `.github/workflows/release.yml`

Trigger: push of a tag matching `v*` (e.g. `v1.0.1`)

Steps:
1. Checkout code
2. Set up Node.js 20
3. `npm ci`
4. `npm run dist` — builds universal macOS DMG via electron-builder
5. Publishes the DMG as a GitHub release using `GH_TOKEN` secret

The release body (written when tagging) becomes the release notes shown in the in-app popup.

**Required one-time setup:** Add a `GH_TOKEN` secret to the GitHub repo (Settings → Secrets → Actions). The token needs `contents: write` permission to create releases.

## Section 3 — In-App Update Popup

### main.js changes

Replace the current `autoUpdater.checkForUpdatesAndNotify()` with explicit event listeners:

- `update-available` — send `{version, releaseNotes}` to renderer via `mainWindow.webContents.send('update-available', info)`
- `update-downloaded` — send `update-downloaded` to renderer so the button changes to "Restart & Install"
- `error` — log silently, never crash the app

Add IPC handler: `autoUpdater:install` — calls `autoUpdater.quitAndInstall()`

### renderer changes

`renderer/app.js` (or a new `renderer/updater.js` loaded in `index.html`):

- Listen for `update-available` via `window.api.onUpdateAvailable(callback)`
- Listen for `update-downloaded` via `window.api.onUpdateDownloaded(callback)`
- Show a fixed modal overlay with:
  - Title: "Update Available — v{version}"
  - Release notes rendered as plain text in a scrollable box
  - Button: **"Update & Restart"** — triggers `window.api.installUpdate()`
  - Button: **"Later"** — dismisses modal (update installs on next app close)
- When `update-downloaded` fires, the modal download progress changes to "Ready to install"

### preload.js changes

Add to `contextBridge.exposeInMainWorld('api', ...)`:
- `onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info))`
- `onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb())`
- `installUpdate: () => ipcRenderer.invoke('autoUpdater:install')`

## Section 4 — Shipping Workflow

To release an update:
1. Make changes, fix bugs, add features
2. Bump `version` in `package.json` (e.g. `1.0.0` → `1.0.1`)
3. `git add package.json && git commit -m "chore: bump version to 1.0.1"`
4. `git push`
5. `git tag v1.0.1 && git push --tags`
6. GitHub Actions builds the DMG (~5 min) and publishes the release
7. Both apps show the update popup on next launch

Release notes are written in the GitHub release body (GitHub auto-creates a draft from the tag — edit it before publishing, or use `--notes` with `gh release create`).

## Section 5 — First Install

Since the app is unsigned (no Apple Developer account):
- Users right-click the DMG → Open → "Open Anyway" once
- After that, updates install silently without further security prompts because `electron-updater` applies the delta update in-place without re-triggering Gatekeeper on subsequent updates

## What Is Not In Scope

- Code signing / notarization (requires $99/yr Apple Developer account)
- Windows builds
- Rollback / staged rollouts
