# Cloud Sync + Multi-User — Design Spec
**Date:** 2026-04-20
**Project:** CFG Invoicing (Electron)

---

## Overview

Three changes to the existing single-user, local-SQLite app:

1. **Cloud database** — replace `better-sqlite3` with Supabase (hosted PostgreSQL). All clients, invoices, and global settings live in the cloud. Internet is required to use the app.

2. **Multi-user identity** — a one-time setup screen per machine sets who you are and your SMTP App Password. Identity is stored locally. Every invoice records `created_by` for audit and filtering.

3. **Safe updates** — `electron-updater` handles binary updates from GitHub releases. Schema changes are additive-only SQL migrations applied once in Supabase, never per-device.

PDF re-download is handled by regenerating from cloud data on demand — no file storage service needed.

---

## 1. Data Model

### Supabase Tables

All existing tables migrate to Supabase PostgreSQL with the same column names. Changes:

**`invoices`** — add one column:
```sql
created_by TEXT NOT NULL DEFAULT 'braxton'
```
Valid values: `'braxton'` | `'obada'`. Set automatically from local identity at invoice creation time.

**`settings`** — global only. Keys stored here:
- `companyEmail`, `companyName`, `companyAddress`
- `paymentZelle`, `paymentBank`, `paymentOther`
- `overdueRemindersEnabled`, `overdueReminderDays`
- `schemaVersion` — integer, incremented when schema changes are deployed

Keys **not** stored here (moved to local config):
- `smtpUser`, `smtpPass`, `saveFolder`

All other tables (`clients`, `invoice_line_items`) migrate unchanged.

### Schema Versioning

A `schemaVersion` key in the `settings` table holds the current deployed schema version (starts at `1`). On app launch, `src/db.js` reads this value and compares it to the version the app binary expects (`REQUIRED_SCHEMA_VERSION` constant). If the app is behind, it shows a blocking "Please update your app" screen and refuses to continue. This prevents old clients from writing to a schema they don't understand.

---

## 2. Local User Config (`src/user-config.js`)

Stored at `app.getPath('userData')/user-config.json`. Never sent to the cloud.

```json
{
  "user": "braxton",
  "smtpUser": "braxton@checkmatefinancialgroup.com",
  "smtpPass": "xxxx xxxx xxxx xxxx",
  "saveFolder": "/Users/braxton/Documents/CFG Invoices"
}
```

Valid `user` values: `'braxton'` | `'obada'`.

`user-config.js` exports:
- `getConfig()` — returns parsed config or `null` if not set up
- `saveConfig(data)` — writes config file
- `isConfigured()` — returns `true` if config exists and has all required fields

The SMTP email address (`smtpUser`) is stored explicitly so it can be edited without changing the identity. Identity (`user`) and email are independent fields.

---

## 3. First-Launch Setup Screen (`renderer/screens/setup.js`)

Shown when `isConfigured()` returns `false`. Fullscreen, replaces the normal app layout.

Fields:
- **Who are you?** — `<select>`: "Braxton Mondell" / "Obada"
- **Your Gmail App Password** — password input, 16-character App Password for your CFG email
- **PDF Save Folder** — folder picker (existing `dialog.openFolder` IPC)

On submit: validates all fields, calls `window.api.userConfig.save(data)`, then navigates to `'clients'`. The setup screen is never shown again on this machine.

`renderer/app.js` checks `isConfigured()` on every launch (via `window.api.userConfig.isConfigured()`). If `false`, it renders the setup screen instead of the normal nav + dashboard. If the schema version check fails, it renders a blocking update screen instead.

---

## 4. Settings Screen Update (`renderer/screens/settings.js`)

Add a **"User Settings"** card at the top of the settings screen:

- **Current user** — display only (e.g. "Braxton Mondell")
- **Gmail App Password** — editable, saves to local config only
- **PDF Save Folder** — editable folder picker, saves to local config only

The existing SMTP fields (`smtpUser`, `smtpPass`) are removed from the global settings card. Company info and payment method fields remain in global settings (saved to Supabase).

---

## 5. `src/db.js` Rewrite

Replace `better-sqlite3` with `@supabase/supabase-js`. The Supabase URL and anon key are bundled as constants — acceptable for a private internal tool with no public distribution.

The Supabase URL and anon key are stored in a new `src/supabase.js` file as exported constants — not hardcoded inline in `db.js`. This makes them easy to update without hunting through query code.

All existing exported functions keep the same signatures. Internally they use Supabase client calls instead of prepared SQLite statements. Key translation points:

| SQLite pattern | Supabase equivalent |
|---------------|-------------------|
| `db.prepare(sql).all()` | `supabase.from('table').select('*')` |
| `db.prepare(sql).get(id)` | `supabase.from('table').select('*').eq('id', id).single()` |
| `db.prepare(sql).run(...)` | `supabase.from('table').insert({...})` / `.update({...})` / `.delete()` |
| `db.transaction(fn)()` | Sequential awaited Supabase calls (no native transaction; use Supabase RPC for `createInvoice`) |

`createInvoice` uses a Supabase RPC function (PostgreSQL stored procedure) to insert the invoice and all line items atomically, matching the current SQLite transaction behavior.

`getAllInvoices` fetches all invoices joined with clients in one query, then fetches all line items in a second query and merges them in JS (grouping by `invoice_id`). This replaces the SQLite `GROUP_CONCAT` pattern and returns the same shape the screens already expect.

`db.js` is now async throughout. All IPC handlers in `main.js` already use `async/await`, so no IPC changes are needed.

---

## 6. Mailer Update (`src/mailer.js`)

Instead of reading `smtpUser`/`smtpPass` from the settings table, read them from `userConfig.getConfig()`. No other changes to the mailer.

---

## 7. PDF Regeneration (`src/pdf-generator.js`)

Add `regenerateInvoicePDF(invoiceId, saveFolder)`:

1. Reads the full invoice from Supabase via `getInvoiceById(invoiceId)` (already exists)
2. Reads client via `getClientById(client_id)` (add this function to `db.js`)
3. Reads global settings via `getAllSettings()`
4. Renders the hidden BrowserWindow PDF (same pipeline as `generatePaidPDF`)
5. Saves to `saveFolder` with the original invoice number as filename
6. Returns the saved file path

This is exposed via a new IPC handler `pdf:regenerate` and `window.api.pdf.regenerate(invoiceId)`.

---

## 8. Invoices Screen Updates (`renderer/screens/invoices.js`)

### "Download PDF" button
Every invoice row gets a **"↓ PDF"** button in the actions column. Clicking it calls `window.api.pdf.regenerate(inv.id)`, then opens the saved file with `shell.openPath`.

### Created-by display
A small muted tag next to the invoice number: `braxton` or `obada`. Styled like a mini badge.

### "Created by" filter
The filter bar adds a **"Created By"** dropdown: All / Braxton / Obada. Filters `inv.created_by === selectedUser`.

---

## 9. Auto-Update (`main.js`)

Add `electron-updater`. On app launch (after identity and schema checks pass):

```javascript
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();
```

`electron-builder` publish config (GitHub repo must be created before first auto-update release):
```json
"publish": {
  "provider": "github",
  "owner": "checkmatefinancialgroup",
  "repo": "cfg-invoicing"
}
```

When a new `.dmg` is published as a GitHub release, running instances are notified and download the update in the background. A toast prompts the user to restart. Local user-config is never touched by the update process.

---

## 10. Data Migration

A one-time migration script (`scripts/migrate-to-supabase.js`) reads the existing local SQLite database and inserts all records into Supabase. Run manually once on Braxton's machine (the primary machine). Steps:

1. Read all clients from local SQLite
2. Insert into Supabase `clients` (preserving IDs)
3. Read all invoices + line items
4. Insert into Supabase `invoices` with `created_by = 'braxton'` (all historical)
5. Insert line items
6. Read all settings, insert global ones into Supabase `settings`

After migration, the old local SQLite file is kept as a backup but the app no longer reads from it.

---

## 11. Files Changed

| File | Change |
|------|--------|
| `src/supabase.js` | New: Supabase URL + anon key constants |
| `src/db.js` | Full rewrite: `better-sqlite3` → Supabase JS client; add `getClientById` |
| `src/user-config.js` | New: local identity + SMTP credentials |
| `src/mailer.js` | Read SMTP from `userConfig` instead of settings table |
| `src/pdf-generator.js` | Add `regenerateInvoicePDF(invoiceId, saveFolder)` |
| `renderer/screens/setup.js` | New: first-launch identity setup screen |
| `renderer/screens/settings.js` | Add User Settings card; remove SMTP from global settings |
| `renderer/screens/invoices.js` | Add Download PDF button, created-by badge, created-by filter |
| `renderer/app.js` | Check `isConfigured()` and schema version on launch |
| `main.js` | Add `electron-updater`; add `pdf:regenerate` and `userConfig.*` IPC handlers |
| `preload.js` | Expose `window.api.userConfig.*` and `window.api.pdf.regenerate` |
| `package.json` | Add `@supabase/supabase-js`, `electron-updater`; add `publish` config |
| `scripts/migrate-to-supabase.js` | New: one-time migration from local SQLite to Supabase |

`better-sqlite3` is removed from dependencies after migration.

---

## Out of Scope

- Real authentication (passwords, sessions)
- Offline mode / local cache with sync
- Conflict resolution (two users editing the same record simultaneously)
- Role-based permissions (both users have full access)
- Supabase Row Level Security (internal tool, not needed)
