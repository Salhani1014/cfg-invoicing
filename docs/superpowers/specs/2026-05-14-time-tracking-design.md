# Time Tracking — Design Spec

**Date:** 2026-05-14
**Status:** Approved (pending final user review of this document)
**Owner:** Obada / Braxton

## 1. Purpose

CFG employs a videographer (and, going forward, other hourly staff) who works on-site. We need a system where:

- The employee clocks in/out via a simple website on their phone.
- Clock-in/out is allowed **only** when their bound device is currently connected to the office UniFi WiFi.
- Brief WiFi drops (bathroom, hallway dead-spots) do not auto-close the shift — manual clock-out remains the source of truth.
- Every WiFi connect/disconnect event is recorded as an audit log, so when an employee forgets to clock out, the admin can close the shift using the last-seen WiFi timestamp.
- Admins (Obada + Braxton) manage everything from a new "Time Tracking" tab inside the existing CFG Invoicing Electron app — no separate admin panel to build or maintain.
- Mismatch alerts (shift still open but device off WiFi 30+ min) push a GHL SMS to the admin and surface in the admin tab.

No Google Sheet export. The Electron app is the source of truth for admin viewing/editing.

## 2. Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Videographer phone         │         │  CFG Invoicing (Electron)    │
│  → clockin.checkmatefg.com  │         │  → new "Time Tracking" tab   │
│  Next.js on Vercel          │         │  Salhani1014/cfg-invoicing   │
└───────────────┬─────────────┘         └───────────────┬──────────────┘
                │                                       │
                │           Supabase (shared)           │
                │  ┌────────────────────────────────┐   │
                └─►│ tt_employees, tt_devices,      │◄──┘
                   │ tt_shifts, tt_wifi_events,     │
                   │ tt_client_snapshot             │
                   └───────────────┬────────────────┘
                                   │
                                   │  realtime subscriptions
                                   │  for live admin dashboard
                                   ▼
                         ┌─────────────────────┐
                         │  Vercel Cron jobs   │
                         │  (in the web app)   │
                         │  • UniFi poll 60s   │──── UniFi Site Manager API
                         │  • Mismatch scan 5m │──── GHL SMS API
                         └─────────────────────┘
```

**Project repos:**

- **`Salhani1014/cfg-invoicing`** (existing) — gains a new screen `renderer/screens/time-tracking.js`, db module `src/db-time-tracking.js`, preload methods, IPC handlers. Ships through existing tag → workflow → publish-draft pipeline.
- **`checkmate-clockin`** (new, name TBD) — fresh Next.js 16 + Vercel project. Houses the videographer web app, the UniFi poller cron, and the mismatch-alert cron. Subdomain interim `<project>.vercel.app`, final `clockin.checkmatefinancialgroup.com` once CNAME is ready.

**Supabase:** Same project as CFG Invoicing (`wbzdayezlwqslfcnvcjc`, currently on Pro plan). New tables prefixed `tt_` for visual isolation.

## 3. Data Model

All tables RLS-protected. Anon key ships in both the Electron DMG and Vercel client-side bundle, so RLS is the security boundary.

### `tt_employees`

| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| full_name | text | |
| email | text unique | matches Supabase Auth email |
| phone | text | E.164 for GHL SMS if we ever message the employee directly |
| role | text check in ('employee','admin') | |
| active | bool default true | soft-disable |
| created_at | timestamptz default now() | |

### `tt_devices`

| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| employee_id | uuid fk tt_employees | **UNIQUE** — one device per employee |
| mac_address | text unique | normalized lowercase, colon-separated |
| label | text | "iPhone 15 Pro" — populated from UniFi client hostname |
| bound_at | timestamptz | |
| unbound_at | timestamptz nullable | when admin unbinds; row stays for audit |

When `unbound_at` is set, the row no longer counts as the employee's active device. New binding inserts a fresh row.

### `tt_shifts`

| column | type | notes |
|--------|------|-------|
| id | uuid pk | |
| employee_id | uuid fk | |
| clock_in_at | timestamptz | |
| clock_out_at | timestamptz nullable | NULL = open shift |
| clock_in_method | text check in ('manual','admin_edit') | |
| clock_out_method | text check in ('manual','admin_edit','admin_audit_close') nullable | `admin_audit_close` = admin used the WiFi-disconnect timestamp to close a forgotten clock-out |
| notes | text nullable | free-form, admin-written |
| edited_by | uuid fk tt_employees nullable | admin who edited |
| edited_at | timestamptz nullable | |

Index on `(employee_id, clock_in_at desc)`.

### `tt_wifi_events`

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| mac_address | text | |
| employee_id | uuid fk nullable | resolved at write time via tt_devices lookup; nullable for unbound MACs we don't care about |
| event_type | text check in ('connect','disconnect') | |
| occurred_at | timestamptz | |

Index on `(employee_id, occurred_at desc)`. Index on `(mac_address, occurred_at desc)`.

Retention: keep 90 days, then archive/delete (not implemented in v1; add a cron later if volume becomes an issue).

### `tt_client_snapshot`

Single-row-per-MAC table the poller diffs against on each tick.

| column | type | notes |
|--------|------|-------|
| mac_address | text pk | |
| currently_connected | bool | |
| last_seen_at | timestamptz | last poll where this MAC was in UniFi's connected list |
| hostname | text nullable | from UniFi |
| updated_at | timestamptz | |

### `tt_alerts_sent`

Tracks which mismatch alerts have already been SMS'd so we don't spam the admin every 5 min for the same open shift.

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| shift_id | uuid fk tt_shifts | UNIQUE — one alert per shift |
| sent_at | timestamptz | |
| recipients | text[] | E.164 numbers that received it |

### `tt_poll_errors` (diagnostic)

| column | type | notes |
|--------|------|-------|
| id | bigserial pk | |
| occurred_at | timestamptz default now() | |
| stage | text | 'unifi_fetch', 'snapshot_upsert', etc. |
| error | text | message + stack snippet |

Auto-prune older than 14 days (handled by a simple SQL cron later, not v1).

### RLS policies (summary)

- `tt_employees` — employee can SELECT their own row only; admin can SELECT/INSERT/UPDATE all.
- `tt_devices` — employee can SELECT/INSERT their own row; admin can SELECT/UPDATE/DELETE all.
- `tt_shifts` — employee can SELECT their own rows and INSERT/UPDATE their open shift via a stored procedure (`clock_in()` / `clock_out()`); admin can do everything.
- `tt_wifi_events` — employee no access; admin SELECT only. Writes happen via service-role from the Vercel cron only.
- `tt_client_snapshot` — service-role only.

## 4. Videographer Web App (Next.js on Vercel)

### Routes

- `/` — auth gate. If not logged in → `/login`. If logged in but no device bound → `/bind`. If both → `/home`.
- `/login` — email input → Supabase magic link send. Sticky session (30-day refresh).
- `/bind` — first-time device-binding flow (see below).
- `/home` — clock in/out screen.
- `/api/clock` — POST endpoint, validates WiFi presence, writes shift.
- `/api/bind-device` — POST endpoint, validates WiFi presence + IP match, writes device.

### Device binding flow (`/bind`)

1. Page loads, checks `req.ip` against `OFFICE_PUBLIC_IP` env var. If mismatch → show "You need to be on the office WiFi to register your device" and stop.
2. Server calls UniFi Site Manager API for currently-connected clients filtered by the office's WAN IP (effectively all of them on this site).
3. Server cross-references those clients against `tt_devices` — anything already bound to another employee is excluded.
4. Page shows the remaining candidate clients (typically 1–3, since most people don't bring random devices): "Is one of these yours?" with hostname + last-seen.
5. Employee picks → server inserts `tt_devices` row with their `employee_id` and the MAC.
6. Redirect to `/home`.

If they pick the wrong device, admin can unbind it from the admin tab.

### Clock in/out flow (`/home`)

UI:
- Current status pill: "Clocked Out" (gray) or "Clocked In since 9:14 AM" (green).
- One big button: "Clock In" or "Clock Out" depending on state.
- Today's accumulated hours (sum of today's shifts).
- Last 7 days summary at bottom — daily totals.

Click → POST `/api/clock`:
1. Get employee's bound MAC from `tt_devices`.
2. Call UniFi Site Manager API → list of currently-connected MACs.
3. If employee's MAC not in list → return 403 "You must be connected to the office WiFi."
4. Otherwise: insert or update `tt_shifts` row.
5. Return new status.

If 403, show: "You're not on the office WiFi. Reconnect and try again. If you forgot to clock out earlier, message your manager — we can fix the shift from the audit log."

### Session persistence

Default Supabase Auth config: 1-hour access token, 30-day refresh token. They log in once via magic link and stay logged in. We rely on `supabase.auth.getSession()` server-side via cookies (Supabase SSR helpers).

If admin unbinds their device, the next clock attempt fails with a clear message — they re-bind from `/bind`.

## 5. Admin Tab in CFG Invoicing

New screen: `renderer/screens/time-tracking.js` registered with `window.navigate('time-tracking')`. Nav entry added to the existing sidebar/header.

New db module: `src/db-time-tracking.js` exposing functions like `listEmployees`, `listShifts(employeeId, weekStart)`, `listWifiEventsForShift(shiftId)`, `editShift(id, patch)`, `unbindDevice(employeeId)`, `subscribeLiveStatus(callback)`.

New IPC handlers in `main.js` (mirroring the existing pattern for `db.js`):
- `time-tracking:list-employees`
- `time-tracking:list-shifts`
- `time-tracking:list-wifi-events-for-shift`
- `time-tracking:edit-shift`
- `time-tracking:create-employee`
- `time-tracking:unbind-device`
- `time-tracking:list-open-alerts`
- `time-tracking:close-shift-via-audit`

New preload methods on `window.api.timeTracking.*`.

### Sub-tabs inside the screen

**Live** (default)
- Real-time list of employees: name | status (Clocked In/Out) | clocked in since | WiFi connection dot (green/red)
- Powered by Supabase realtime channel subscribed to `tt_shifts` and `tt_client_snapshot`

**Timesheets**
- Picker: employee + week (default current week)
- Table: each row is a shift — clock_in, clock_out, duration, method, notes, edit pencil
- Below each row, a collapsible "WiFi audit timeline" — horizontal strip showing connect/disconnect markers between the shift's start and end (or end-of-day if still open). Helps spot mismatches at a glance.
- Edit shift modal: editable clock_in_at, clock_out_at, notes. Saves `edited_by` and `edited_at`. Shows a hint: "Last WiFi disconnect was 5:32 PM — use this?" with a one-click button to apply.

**Employees**
- Table: name | email | phone | active | bound device | actions
- Add Employee form: name, email, phone, role
- Per-row actions: Edit, Toggle Active, Unbind Device (only if a device is bound), Delete (with cascade warning)

**Alerts**
- List of currently-open shifts where the bound device has been off WiFi for >30 min
- Per row: employee | clocked in at | last seen on WiFi at | duration since | "Close shift at last-seen" button
- Clicking the button calls `close-shift-via-audit` which sets `clock_out_at = last_seen_at`, `clock_out_method = 'admin_audit_close'`, and writes `edited_by/edited_at`.

## 6. UniFi Polling Cron (Vercel)

`/api/cron/poll-unifi` — runs every 60s via `vercel.json` cron config.

```
1. Fetch UniFi Site Manager API: GET /v1/sites/{siteId}/clients
2. Build map: { mac → { connected: true, hostname, last_seen } }
3. SELECT all rows from tt_client_snapshot.
4. For each MAC in either set:
   - If was connected and now isn't → INSERT tt_wifi_events (disconnect)
   - If wasn't connected and now is → INSERT tt_wifi_events (connect)
   - Resolve employee_id via tt_devices lookup (LEFT JOIN on mac_address WHERE unbound_at IS NULL)
5. UPSERT tt_client_snapshot rows.
```

UniFi auth: bearer token from `UNIFI_API_KEY` env var. Create at unifi.ui.com → Settings → Control Plane → Integrations → API.

Failure handling: log to Vercel + write a `tt_poll_errors` row (cheap diagnostic). Don't retry within a single tick — next tick re-converges.

## 7. Mismatch Alert Cron (Vercel)

`/api/cron/mismatch-scan` — runs every 5 min.

```
1. SELECT open shifts (clock_out_at IS NULL)
2. For each: get the employee's currently-bound device's mac_address
3. SELECT from tt_client_snapshot — if currently_connected = false AND last_seen_at < now() - interval '30 min'
4. Has this mismatch already been alerted? (track in tt_alerts_sent table: { shift_id, sent_at } — prevents spam)
5. If new mismatch → send GHL SMS to admin phone(s) using master GHL key, insert tt_alerts_sent row.
```

SMS template: "[CFG Time Tracking] {employee_name} is still clocked in but has been off the office WiFi for {minutes} min. Last seen at {time}. Check the admin app."

Admin recipients: configurable list in env (`ADMIN_ALERT_PHONES` — comma-separated E.164). Initially just Obada's number.

## 8. Environment & Secrets

**Vercel env:**
- `SUPABASE_URL` — same as CFG Invoicing
- `SUPABASE_ANON_KEY` — for client-side
- `SUPABASE_SERVICE_ROLE_KEY` — for cron/server routes
- `UNIFI_API_KEY` — Site Manager bearer token
- `UNIFI_SITE_ID` — the site UUID to poll
- `OFFICE_PUBLIC_IP` — for the bootstrap IP check during device binding
- `GHL_API_KEY` — master key from existing GHL setup
- `GHL_LOCATION_ID` — wherever the admin SMS should originate
- `ADMIN_ALERT_PHONES` — comma-separated E.164

**CFG Invoicing env (Electron):** none new — the existing `SUPABASE_URL` and anon key cover it. The new tab uses the same Supabase client, just with additional table access.

## 9. Prerequisites Before Implementation

1. **UniFi API token** created at unifi.ui.com (Site Manager scope, read clients).
2. **Site ID** captured from the API once the token works (`GET /v1/sites`).
3. **Office public IP** known (whatismyip.com from the office).
4. **GHL phone numbers** confirmed for admin alerts.
5. **Vercel project created** (empty, linked to a new GitHub repo).
6. **Final subdomain CNAME** — deferred. Use `*.vercel.app` for now.

## 10. Out of Scope (Explicit YAGNI)

- Google Sheet export — dropped, app is source of truth.
- Multi-device per employee — dropped, one device per employee enforced by UNIQUE constraint.
- Auto clock-out on WiFi disconnect — dropped per user requirement (bathroom-break false positives).
- Payroll system integration — manual review in the admin tab is fine for now.
- Geofencing by GPS — UniFi presence is the geofence.
- Self-service "I forgot to clock out" employee form — admin handles via audit log.
- Time-off / PTO tracking — separate concern.
- Break tracking — not requested.
- Photo/selfie at clock-in — not requested.

## 11. Open Items for Follow-Up

- **GHL location for admin SMS** — confirm which location ID to use as the sender.
- **Admin user accounts** — confirm Obada + Braxton both get `role='admin'` rows in `tt_employees` and that their Electron app sessions tie to those rows for the `edited_by` audit field. (May reuse whatever auth context the Electron app already has — TBD during implementation.)

## 12. Success Criteria

- Videographer can log in on his phone via magic link, bind his device while on office WiFi, and successfully clock in/out — refused if off WiFi.
- Admin tab shows live "clocked in now" status and weekly timesheets with WiFi audit overlay.
- A forgotten clock-out can be closed by the admin in <30 seconds using the audit-log one-click button.
- Mismatch SMS arrives within ~5 min of the threshold being crossed.
- The Electron release process (existing pipeline) ships the new tab cleanly via auto-update.
