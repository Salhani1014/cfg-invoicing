# Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WiFi-presence-validated time-tracking system: videographer clocks in/out via a phone web app at `clockin.checkmatefinancialgroup.com`, admin manages everything in a new Time Tracking tab inside the CFG Invoicing Electron app, with a UniFi-driven audit log and GHL SMS mismatch alerts.

**Architecture:** Two surfaces, one Supabase. New Next.js 16 app on Vercel hosts the videographer UI plus the UniFi polling and mismatch-scan cron jobs. New tab inside `Salhani1014/cfg-invoicing` provides admin views (Live / Timesheets / Employees / Alerts). Both surfaces talk to the same Supabase project (`wbzdayezlwqslfcnvcjc`, Pro plan) with new tables prefixed `tt_`.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind + Vitest + `@supabase/ssr` on Vercel; Electron 41 + vanilla JS + Jest in CFG Invoicing; Supabase Postgres + RLS; UniFi Site Manager API; GHL SMS API.

**Reference spec:** `docs/superpowers/specs/2026-05-14-time-tracking-design.md`

---

## File Map

### New repo: `checkmate-clockin` (Next.js on Vercel)

```
checkmate-clockin/
├── .env.local.example
├── .gitignore
├── README.md
├── next.config.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── vercel.json                       # cron config
├── middleware.ts                     # auth gate + session refresh
├── supabase/migrations/
│   └── 20260514000000_time_tracking.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # route guard → /login | /bind | /home
│   │   ├── login/page.tsx            # magic link form
│   │   ├── auth/callback/route.ts    # OAuth callback handler
│   │   ├── bind/page.tsx             # device binding UI
│   │   ├── home/page.tsx             # clock in/out UI
│   │   └── api/
│   │       ├── clock/route.ts
│   │       ├── bind-device/route.ts
│   │       └── cron/
│   │           ├── poll-unifi/route.ts
│   │           └── mismatch-scan/route.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # browser
│   │   │   ├── server.ts             # SSR (cookies)
│   │   │   └── admin.ts              # service role
│   │   ├── unifi.ts                  # Site Manager API wrapper
│   │   ├── ghl.ts                    # SMS sender
│   │   └── env.ts                    # typed env access
│   └── tests/
│       ├── unifi.test.ts
│       ├── ghl.test.ts
│       ├── clock.api.test.ts
│       ├── bind-device.api.test.ts
│       ├── poll-unifi.test.ts
│       └── mismatch-scan.test.ts
```

### Modifications to `fuego-leadz` (CFG Invoicing Electron)

```
fuego-leadz/
├── src/
│   └── db-time-tracking.js           # CREATE — Supabase queries
├── main.js                           # MODIFY — add time-tracking:* IPC handlers
├── preload.js                        # MODIFY — expose window.api.timeTracking
├── renderer/
│   ├── app.js                        # MODIFY — register 'time-tracking' route
│   ├── index.html                    # MODIFY — add nav button
│   └── screens/
│       └── time-tracking.js          # CREATE — full screen with sub-tabs
└── tests/
    └── db-time-tracking.test.js      # CREATE
```

---

## Phase 0 — Prerequisites (user actions before any code)

### Task 0.1: Gather UniFi credentials

**You (Obada) do this once:**

- [ ] **Step 1: Create UniFi API token**

Log into https://unifi.ui.com → click your account avatar → API → "Create API Key" → name it `time-tracking`, scope `Site Manager`, copy the token.

- [ ] **Step 2: Find the site ID**

```bash
curl -s -H "X-API-KEY: $UNIFI_API_KEY" https://api.ui.com/ea/sites | jq
```

Expected: a JSON array with one or more sites. Copy the `id` of the office site.

(If the path is different in the current Site Manager API release, check https://developer.ui.com/site-manager-api/ for the right endpoint — they have versioned it as `/ea/` and `/v1/` at different times. Use whichever returns data.)

- [ ] **Step 3: Get the office public IP**

From a device on the office WiFi:

```bash
curl ifconfig.me
```

Save all three values (token, site_id, office_ip) — you'll paste them into Vercel env in Phase 8.

### Task 0.2: Confirm GHL admin alert recipients

- [ ] **Step 1: List the phone numbers that should receive mismatch SMS**

Default: Obada's phone only (use the number associated with `obada@checkmatefinancialgroup.com` in GHL). Add Braxton if he wants alerts too. Phones in E.164: `+1XXXXXXXXXX`.

### Task 0.3: Create GitHub repo for videographer app

- [ ] **Step 1: Create empty private repo on GitHub**

```bash
gh repo create Salhani1014/checkmate-clockin --private --description "Videographer clock-in web app (UniFi-gated)"
```

- [ ] **Step 2: Clone locally**

```bash
cd /Users/braxtonmondell && git clone https://github.com/Salhani1014/checkmate-clockin.git
cd checkmate-clockin
```

### Task 0.4: Bootstrap Next.js project

- [ ] **Step 1: Scaffold Next.js 16 with TypeScript + Tailwind**

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --use-npm --no-src-dir=false --import-alias "@/*"
```

When prompted "Would you like to use Turbopack for next dev?" → Yes.

- [ ] **Step 2: Install runtime + test deps**

```bash
npm install @supabase/ssr @supabase/supabase-js zod
npm install -D vitest @vitejs/plugin-react @types/node
```

- [ ] **Step 3: Add npm scripts**

Edit `package.json` `"scripts"`:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 5: Initial commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js + Vitest"
git push -u origin main
```

---

## Phase 1 — Database schema

### Task 1.1: Write the migration

**Files:**
- Create: `supabase/migrations/20260514000000_time_tracking.sql`

- [ ] **Step 1: Write the SQL migration**

```sql
-- ════════════════════════════════════════════════════════════════
-- Time Tracking — tables, RLS, indexes
-- Migration: 20260514000000_time_tracking
-- ════════════════════════════════════════════════════════════════

-- ─── tt_employees ─────────────────────────────────────────────
create table tt_employees (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name    text not null,
  email        text not null unique,
  phone        text,
  role         text not null check (role in ('employee','admin')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── tt_devices ──────────────────────────────────────────────
create table tt_devices (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references tt_employees(id) on delete cascade,
  mac_address  text not null,
  label        text,
  bound_at     timestamptz not null default now(),
  unbound_at   timestamptz
);
-- One ACTIVE device per employee
create unique index tt_devices_one_active_per_employee
  on tt_devices(employee_id) where unbound_at is null;
create unique index tt_devices_unique_active_mac
  on tt_devices(mac_address) where unbound_at is null;

-- ─── tt_shifts ───────────────────────────────────────────────
create table tt_shifts (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references tt_employees(id) on delete cascade,
  clock_in_at       timestamptz not null,
  clock_out_at      timestamptz,
  clock_in_method   text not null check (clock_in_method in ('manual','admin_edit')),
  clock_out_method  text check (clock_out_method in ('manual','admin_edit','admin_audit_close')),
  notes             text,
  edited_by         uuid references tt_employees(id),
  edited_at         timestamptz
);
create index tt_shifts_employee_time on tt_shifts(employee_id, clock_in_at desc);
create unique index tt_shifts_one_open_per_employee
  on tt_shifts(employee_id) where clock_out_at is null;

-- ─── tt_wifi_events ──────────────────────────────────────────
create table tt_wifi_events (
  id           bigserial primary key,
  mac_address  text not null,
  employee_id  uuid references tt_employees(id) on delete set null,
  event_type   text not null check (event_type in ('connect','disconnect')),
  occurred_at  timestamptz not null default now()
);
create index tt_wifi_events_employee_time on tt_wifi_events(employee_id, occurred_at desc);
create index tt_wifi_events_mac_time on tt_wifi_events(mac_address, occurred_at desc);

-- ─── tt_client_snapshot ──────────────────────────────────────
create table tt_client_snapshot (
  mac_address          text primary key,
  currently_connected  boolean not null,
  last_seen_at         timestamptz not null,
  hostname             text,
  updated_at           timestamptz not null default now()
);

-- ─── tt_alerts_sent ──────────────────────────────────────────
create table tt_alerts_sent (
  id          bigserial primary key,
  shift_id    uuid not null unique references tt_shifts(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  recipients  text[] not null
);

-- ─── tt_poll_errors ──────────────────────────────────────────
create table tt_poll_errors (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  stage        text not null,
  error        text
);

-- ════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════
alter table tt_employees       enable row level security;
alter table tt_devices         enable row level security;
alter table tt_shifts          enable row level security;
alter table tt_wifi_events     enable row level security;
alter table tt_client_snapshot enable row level security;
alter table tt_alerts_sent     enable row level security;
alter table tt_poll_errors     enable row level security;

-- Helper: am I an admin?
create or replace function tt_is_admin(uid uuid) returns boolean
language sql stable as $$
  select exists(select 1 from tt_employees where auth_user_id = uid and role = 'admin');
$$;

-- ─── tt_employees policies ──
create policy emp_self_select on tt_employees for select
  using (auth_user_id = auth.uid() or tt_is_admin(auth.uid()));
create policy emp_admin_write on tt_employees for all
  using (tt_is_admin(auth.uid())) with check (tt_is_admin(auth.uid()));

-- ─── tt_devices policies ──
create policy dev_self_select on tt_devices for select
  using (
    employee_id in (select id from tt_employees where auth_user_id = auth.uid())
    or tt_is_admin(auth.uid())
  );
create policy dev_self_insert on tt_devices for insert
  with check (employee_id in (select id from tt_employees where auth_user_id = auth.uid()));
create policy dev_admin_all on tt_devices for all
  using (tt_is_admin(auth.uid())) with check (tt_is_admin(auth.uid()));

-- ─── tt_shifts policies ──
create policy shift_self_select on tt_shifts for select
  using (
    employee_id in (select id from tt_employees where auth_user_id = auth.uid())
    or tt_is_admin(auth.uid())
  );
create policy shift_admin_all on tt_shifts for all
  using (tt_is_admin(auth.uid())) with check (tt_is_admin(auth.uid()));
-- Note: employees do NOT INSERT/UPDATE tt_shifts directly via PostgREST.
-- The /api/clock route uses the service-role key to write shifts after
-- validating WiFi presence — keeps clock-in gated server-side.

-- ─── tt_wifi_events policies ──
create policy wifi_admin_select on tt_wifi_events for select
  using (tt_is_admin(auth.uid()));

-- ─── tt_client_snapshot, tt_alerts_sent, tt_poll_errors ──
-- No policies = service-role only.

-- ════════════════════════════════════════════════════════════════
-- Realtime publication for admin live view
-- ════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table tt_shifts;
alter publication supabase_realtime add table tt_client_snapshot;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260514000000_time_tracking.sql
git commit -m "feat(db): time-tracking schema with RLS"
```

### Task 1.2: Apply the migration

- [ ] **Step 1: Apply via Supabase MCP**

Use the MCP tool `mcp__plugin_supabase_supabase__apply_migration` with:
- `name`: `20260514000000_time_tracking`
- `query`: contents of the migration file

Expected: success, no errors.

- [ ] **Step 2: Verify tables exist**

Use MCP `mcp__plugin_supabase_supabase__list_tables` and confirm all 7 `tt_*` tables present.

- [ ] **Step 3: Seed the first admin row (Obada)**

Use MCP `mcp__plugin_supabase_supabase__execute_sql`:

```sql
insert into tt_employees (full_name, email, phone, role)
values ('Obada Salhani', 'obada@checkmatefinancialgroup.com', '+1XXXXXXXXXX', 'admin')
on conflict (email) do nothing;
```

Replace `+1XXXXXXXXXX` with Obada's actual number from Task 0.2.

- [ ] **Step 4: Sanity-check RLS by running advisors**

Use MCP `mcp__plugin_supabase_supabase__get_advisors` with type `security`. Expected: no critical issues on `tt_*` tables.

---

## Phase 2 — Supabase + UniFi + GHL lib modules (TDD)

### Task 2.1: Typed env access

**Files:**
- Create: `src/lib/env.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Write `src/lib/env.ts`**

```ts
import { z } from 'zod';

const Schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  UNIFI_API_KEY: z.string().min(10),
  UNIFI_SITE_ID: z.string().min(1),
  UNIFI_BASE_URL: z.string().url().default('https://api.ui.com'),
  OFFICE_PUBLIC_IP: z.string().min(7),
  GHL_API_KEY: z.string().min(10),
  GHL_LOCATION_ID: z.string().min(1),
  ADMIN_ALERT_PHONES: z.string().min(7), // comma-separated E.164
  CRON_SECRET: z.string().min(16),
});

export const env = Schema.parse(process.env);

export const adminAlertPhones = (): string[] =>
  env.ADMIN_ALERT_PHONES.split(',').map(p => p.trim()).filter(Boolean);
```

- [ ] **Step 2: Write `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://wbzdayezlwqslfcnvcjc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UNIFI_API_KEY=
UNIFI_SITE_ID=
UNIFI_BASE_URL=https://api.ui.com
OFFICE_PUBLIC_IP=
GHL_API_KEY=
GHL_LOCATION_ID=
ADMIN_ALERT_PHONES=+1XXXXXXXXXX
CRON_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts .env.local.example
git commit -m "feat(lib): typed env access"
```

### Task 2.2: Supabase client modules

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`

- [ ] **Step 1: Write browser client**

```ts
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export const supabaseBrowser = () =>
  createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
```

- [ ] **Step 2: Write server (SSR) client**

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export const supabaseServer = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server components can't set cookies; middleware handles refresh.
          }
        },
      },
    }
  );
};
```

- [ ] **Step 3: Write service-role admin client**

```ts
// src/lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

export const supabaseAdmin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase
git commit -m "feat(lib): supabase browser/server/admin clients"
```

### Task 2.3: UniFi wrapper — failing tests first

**Files:**
- Create: `src/lib/unifi.ts`
- Create: `src/tests/unifi.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/tests/unifi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listConnectedClients, normalizeMac } from '@/lib/unifi';

describe('normalizeMac', () => {
  it('lowercases and converts dashes/dots to colons', () => {
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('AABB.CCDD.EEFF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
  });
});

describe('listConnectedClients', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('UNIFI_API_KEY', 'test-key');
    vi.stubEnv('UNIFI_SITE_ID', 'site-1');
    vi.stubEnv('UNIFI_BASE_URL', 'https://api.test');
  });

  it('returns mapped clients on 200', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { mac: 'AA:BB:CC:DD:EE:01', hostname: 'iPhone-15', last_seen: 1715000000 },
          { mac: 'AA:BB:CC:DD:EE:02', hostname: 'MacBook',   last_seen: 1715000005 },
        ],
      }),
    });

    const out = await listConnectedClients();
    expect(out).toEqual([
      { mac: 'aa:bb:cc:dd:ee:01', hostname: 'iPhone-15', lastSeenAt: new Date(1715000000 * 1000) },
      { mac: 'aa:bb:cc:dd:ee:02', hostname: 'MacBook',   lastSeenAt: new Date(1715000005 * 1000) },
    ]);
  });

  it('throws on non-ok response', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: false, status: 401, text: async () => 'unauthorized',
    });
    await expect(listConnectedClients()).rejects.toThrow(/unifi.*401/i);
  });
});
```

- [ ] **Step 2: Run tests — should fail**

```bash
npm test
```

Expected: `Cannot find module '@/lib/unifi'` or similar.

- [ ] **Step 3: Implement `src/lib/unifi.ts`**

```ts
import { env } from '@/lib/env';

export type UnifiClient = {
  mac: string;
  hostname: string | null;
  lastSeenAt: Date;
};

export function normalizeMac(mac: string): string {
  return mac.toLowerCase().replace(/[^0-9a-f]/g, '').match(/.{2}/g)!.join(':');
}

export async function listConnectedClients(): Promise<UnifiClient[]> {
  const url = `${env.UNIFI_BASE_URL}/ea/sites/${env.UNIFI_SITE_ID}/clients`;
  const res = await fetch(url, {
    headers: { 'X-API-KEY': env.UNIFI_API_KEY, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`unifi listClients failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as { data: Array<{ mac: string; hostname?: string; last_seen?: number }> };
  return (json.data ?? []).map(c => ({
    mac: normalizeMac(c.mac),
    hostname: c.hostname ?? null,
    lastSeenAt: new Date((c.last_seen ?? 0) * 1000),
  }));
}

export async function isMacConnected(mac: string): Promise<{ connected: boolean; hostname: string | null }> {
  const target = normalizeMac(mac);
  const clients = await listConnectedClients();
  const hit = clients.find(c => c.mac === target);
  return { connected: !!hit, hostname: hit?.hostname ?? null };
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npm test
```

Expected: all `unifi.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/unifi.ts src/tests/unifi.test.ts
git commit -m "feat(unifi): Site Manager client wrapper"
```

> **Note for executor:** If the live API responds with a different shape (e.g. `last_seen` ISO string instead of unix-seconds, or path `/v1/sites/...` instead of `/ea/sites/...`), `WebFetch` https://developer.ui.com/site-manager-api/ to confirm and adjust both the implementation and the test fixture. Don't ship a wrapper that doesn't match production.

### Task 2.4: GHL SMS wrapper — failing tests first

**Files:**
- Create: `src/lib/ghl.ts`
- Create: `src/tests/ghl.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/tests/ghl.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendGhlSms } from '@/lib/ghl';

describe('sendGhlSms', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('GHL_API_KEY', 'k');
    vi.stubEnv('GHL_LOCATION_ID', 'loc');
  });

  it('POSTs to GHL conversations API', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'msg' }) });
    const id = await sendGhlSms({ to: '+15551234567', body: 'hi' });
    expect(id).toBe('msg');
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toMatch(/leadconnectorhq\.com|services\.leadconnectorhq\.com/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ message: 'hi', phone: '+15551234567' });
  });

  it('throws on non-ok', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' });
    await expect(sendGhlSms({ to: '+15551234567', body: 'x' })).rejects.toThrow(/ghl.*400/i);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- ghl
```

- [ ] **Step 3: Implement `src/lib/ghl.ts`**

```ts
import { env } from '@/lib/env';

export async function sendGhlSms(args: { to: string; body: string }): Promise<string> {
  const res = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GHL_API_KEY}`,
      'Content-Type': 'application/json',
      Version: '2021-04-15',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      type: 'SMS',
      locationId: env.GHL_LOCATION_ID,
      phone: args.to,
      message: args.body,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ghl sms failed ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as { id?: string; messageId?: string };
  return json.id ?? json.messageId ?? '';
}
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- ghl
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ghl.ts src/tests/ghl.test.ts
git commit -m "feat(ghl): SMS sender"
```

---

## Phase 3 — UniFi polling cron

### Task 3.1: `vercel.json` cron registration

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/poll-unifi",     "schedule": "* * * * *" },
    { "path": "/api/cron/mismatch-scan",  "schedule": "*/5 * * * *" }
  ]
}
```

(Vercel Cron's minimum interval is 1 minute. The spec asks for ~60s — `* * * * *` runs every minute, which satisfies that.)

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(vercel): cron schedule"
```

### Task 3.2: Poll endpoint — failing test

**Files:**
- Create: `src/tests/poll-unifi.test.ts`
- Create: `src/app/api/cron/poll-unifi/route.ts`

- [ ] **Step 1: Write failing test for the diff logic**

```ts
// src/tests/poll-unifi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffSnapshot } from '@/app/api/cron/poll-unifi/route';

describe('diffSnapshot', () => {
  const now = new Date('2026-05-14T15:00:00Z');

  it('emits connect for newly-seen MAC', () => {
    const prev = new Map();
    const curr = [{ mac: 'aa', hostname: 'h', lastSeenAt: now }];
    expect(diffSnapshot(prev, curr, now)).toEqual({
      events: [{ mac: 'aa', type: 'connect', at: now }],
      upserts: [{ mac: 'aa', connected: true, lastSeenAt: now, hostname: 'h' }],
    });
  });

  it('emits disconnect when MAC was connected but is now missing', () => {
    const prev = new Map([['aa', { connected: true, lastSeenAt: now, hostname: 'h' }]]);
    const curr: any[] = [];
    const { events, upserts } = diffSnapshot(prev, curr, now);
    expect(events).toEqual([{ mac: 'aa', type: 'disconnect', at: now }]);
    expect(upserts).toEqual([{ mac: 'aa', connected: false, lastSeenAt: now, hostname: 'h' }]);
  });

  it('emits no event when state unchanged', () => {
    const prev = new Map([['aa', { connected: true, lastSeenAt: now, hostname: 'h' }]]);
    const curr = [{ mac: 'aa', hostname: 'h', lastSeenAt: now }];
    expect(diffSnapshot(prev, curr, now).events).toEqual([]);
  });

  it('emits reconnect (connect) when MAC was disconnected and reappears', () => {
    const prev = new Map([['aa', { connected: false, lastSeenAt: now, hostname: 'h' }]]);
    const curr = [{ mac: 'aa', hostname: 'h', lastSeenAt: now }];
    expect(diffSnapshot(prev, curr, now).events).toEqual([{ mac: 'aa', type: 'connect', at: now }]);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- poll-unifi
```

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/cron/poll-unifi/route.ts
import { NextResponse } from 'next/server';
import { listConnectedClients, type UnifiClient } from '@/lib/unifi';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

type SnapshotRow = { mac: string; connected: boolean; lastSeenAt: Date; hostname: string | null };

export function diffSnapshot(
  prev: Map<string, SnapshotRow>,
  curr: UnifiClient[],
  now: Date,
): {
  events: Array<{ mac: string; type: 'connect' | 'disconnect'; at: Date }>;
  upserts: SnapshotRow[];
} {
  const events: Array<{ mac: string; type: 'connect' | 'disconnect'; at: Date }> = [];
  const upserts: SnapshotRow[] = [];
  const seen = new Set<string>();

  for (const c of curr) {
    seen.add(c.mac);
    const before = prev.get(c.mac);
    if (!before || !before.connected) {
      events.push({ mac: c.mac, type: 'connect', at: now });
    }
    upserts.push({ mac: c.mac, connected: true, lastSeenAt: now, hostname: c.hostname });
  }

  for (const [mac, before] of prev) {
    if (seen.has(mac)) continue;
    if (before.connected) {
      events.push({ mac, type: 'disconnect', at: now });
      upserts.push({ mac, connected: false, lastSeenAt: now, hostname: before.hostname });
    }
  }

  return { events, upserts };
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date();

  try {
    const clients = await listConnectedClients();

    const { data: snap, error: snapErr } = await db
      .from('tt_client_snapshot')
      .select('mac_address, currently_connected, last_seen_at, hostname');
    if (snapErr) throw snapErr;

    const prev = new Map<string, SnapshotRow>(
      (snap ?? []).map(r => [r.mac_address as string, {
        mac: r.mac_address as string,
        connected: !!r.currently_connected,
        lastSeenAt: new Date(r.last_seen_at as string),
        hostname: (r.hostname as string | null) ?? null,
      }])
    );

    const { events, upserts } = diffSnapshot(prev, clients, now);

    if (upserts.length > 0) {
      const { error: upErr } = await db.from('tt_client_snapshot').upsert(
        upserts.map(u => ({
          mac_address: u.mac,
          currently_connected: u.connected,
          last_seen_at: u.lastSeenAt.toISOString(),
          hostname: u.hostname,
          updated_at: now.toISOString(),
        })),
        { onConflict: 'mac_address' },
      );
      if (upErr) throw upErr;
    }

    if (events.length > 0) {
      // Resolve employee_id per mac via active tt_devices
      const macs = [...new Set(events.map(e => e.mac))];
      const { data: devs } = await db
        .from('tt_devices')
        .select('mac_address, employee_id')
        .in('mac_address', macs)
        .is('unbound_at', null);
      const macToEmp = new Map((devs ?? []).map(d => [d.mac_address as string, d.employee_id as string]));

      const rows = events.map(e => ({
        mac_address: e.mac,
        employee_id: macToEmp.get(e.mac) ?? null,
        event_type: e.type,
        occurred_at: e.at.toISOString(),
      }));
      const { error: evErr } = await db.from('tt_wifi_events').insert(rows);
      if (evErr) throw evErr;
    }

    return NextResponse.json({ ok: true, events: events.length, snapshot: upserts.length });
  } catch (err: any) {
    await db.from('tt_poll_errors').insert({
      stage: 'poll-unifi',
      error: String(err?.message ?? err).slice(0, 1000),
    });
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- poll-unifi
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/poll-unifi src/tests/poll-unifi.test.ts
git commit -m "feat(cron): UniFi poll + snapshot diff"
```

---

## Phase 4 — Auth (Supabase magic link)

### Task 4.1: Middleware route-guard + session refresh

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write middleware**

```ts
// middleware.ts (project root)
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;

  const publicPaths = ['/login', '/auth/callback', '/api/cron'];
  const isPublic = publicPaths.some(p => pathname.startsWith(p));

  if (!user && !isPublic) {
    // API routes get a 401 JSON; pages get a redirect to /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): middleware route-guard + session refresh"
```

### Task 4.2: Login page

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1: Implement login page**

```tsx
// src/app/login/page.tsx
'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setStatus('error'); setError(error.message); }
    else setStatus('sent');
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-semibold">CFG Clock-In</h1>
        <p className="text-sm text-slate-500">Enter your work email. We'll send a one-tap login link.</p>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" autoComplete="email"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <button
          type="submit" disabled={status === 'sending' || status === 'sent'}
          className="w-full rounded-lg bg-slate-900 text-white py-2 font-medium disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Check your email' : 'Send login link'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): login page"
```

### Task 4.3: Auth callback

**Files:**
- Create: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Implement callback**

```ts
// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=missing_code', url));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url));

  return NextResponse.redirect(new URL('/', url));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/auth/callback/route.ts
git commit -m "feat(auth): magic-link callback"
```

### Task 4.4: Root layout + route-guard page

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Simplify layout**

Replace `src/app/layout.tsx` contents:

```tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CFG Clock-In',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Root page becomes router**

Replace `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: employee } = await supabase
    .from('tt_employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!employee) redirect('/login?error=no_employee_record');

  const { data: device } = await supabase
    .from('tt_devices')
    .select('id')
    .eq('employee_id', employee.id)
    .is('unbound_at', null)
    .maybeSingle();

  redirect(device ? '/home' : '/bind');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat(auth): root route guard"
```

---

## Phase 5 — Device binding

### Task 5.1: `/api/bind-device` — failing tests

**Files:**
- Create: `src/tests/bind-device.api.test.ts`
- Create: `src/app/api/bind-device/route.ts`

- [ ] **Step 1: Write failing test for the pure helper**

```ts
// src/tests/bind-device.api.test.ts
import { describe, it, expect } from 'vitest';
import { filterBindableCandidates } from '@/app/api/bind-device/route';

describe('filterBindableCandidates', () => {
  const now = new Date();
  const c = (mac: string) => ({ mac, hostname: mac, lastSeenAt: now });

  it('excludes MACs already bound to any employee', () => {
    const all = [c('aa'), c('bb'), c('cc')];
    const bound = new Set(['bb']);
    expect(filterBindableCandidates(all, bound).map(x => x.mac)).toEqual(['aa', 'cc']);
  });

  it('returns empty when none free', () => {
    expect(filterBindableCandidates([c('aa')], new Set(['aa']))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- bind-device
```

- [ ] **Step 3: Implement route**

```ts
// src/app/api/bind-device/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { listConnectedClients, normalizeMac, type UnifiClient } from '@/lib/unifi';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export function filterBindableCandidates(
  clients: UnifiClient[],
  boundMacs: Set<string>,
): UnifiClient[] {
  return clients.filter(c => !boundMacs.has(c.mac));
}

function clientIp(req: Request): string | null {
  const h = req.headers;
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip');
}

// GET = list candidate devices for binding
export async function GET(req: Request) {
  const ip = clientIp(req);
  if (ip !== env.OFFICE_PUBLIC_IP) {
    return NextResponse.json({ ok: false, error: 'not_on_office_network', ip }, { status: 403 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const admin = supabaseAdmin();
  const clients = await listConnectedClients();
  const { data: bound } = await admin
    .from('tt_devices')
    .select('mac_address')
    .is('unbound_at', null);
  const boundSet = new Set((bound ?? []).map(b => b.mac_address as string));
  const candidates = filterBindableCandidates(clients, boundSet);

  return NextResponse.json({ ok: true, candidates });
}

// POST = bind a chosen MAC to the current employee
const BindBody = z.object({ mac: z.string().min(11) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (ip !== env.OFFICE_PUBLIC_IP) {
    return NextResponse.json({ ok: false, error: 'not_on_office_network' }, { status: 403 });
  }

  const parsed = BindBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  const mac = normalizeMac(parsed.data.mac);

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const admin = supabaseAdmin();

  // Confirm MAC is currently in UniFi clients (anti-spoof)
  const clients = await listConnectedClients();
  const match = clients.find(c => c.mac === mac);
  if (!match) return NextResponse.json({ ok: false, error: 'mac_not_on_wifi' }, { status: 400 });

  // Resolve employee
  const { data: employee } = await admin
    .from('tt_employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!employee) return NextResponse.json({ ok: false, error: 'no_employee_record' }, { status: 403 });

  // Insert (UNIQUE index enforces one active device per employee)
  const { error } = await admin.from('tt_devices').insert({
    employee_id: employee.id,
    mac_address: mac,
    label: match.hostname,
  });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ ok: false, error: 'already_bound' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- bind-device
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/bind-device src/tests/bind-device.api.test.ts
git commit -m "feat(bind): device binding API"
```

### Task 5.2: `/bind` page UI

**Files:**
- Create: `src/app/bind/page.tsx`

- [ ] **Step 1: Implement page**

```tsx
// src/app/bind/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Candidate = { mac: string; hostname: string | null; lastSeenAt: string };

export default function BindPage() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bind-device').then(async r => {
      const body = await r.json();
      if (!r.ok) { setError(body.error || 'unknown'); return; }
      setCandidates(body.candidates ?? []);
    }).catch(e => setError(String(e)));
  }, []);

  async function bind(mac: string) {
    setSubmitting(mac);
    const r = await fetch('/api/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac }),
    });
    const body = await r.json();
    setSubmitting(null);
    if (!r.ok) { setError(body.error); return; }
    router.replace('/home');
  }

  if (error === 'not_on_office_network') {
    return <Centered>You need to be connected to the office WiFi to register your device.</Centered>;
  }
  if (error) return <Centered>Error: {error}</Centered>;
  if (!candidates) return <Centered>Loading…</Centered>;
  if (candidates.length === 0) return <Centered>No unbound devices found on the WiFi right now. Make sure your phone is connected.</Centered>;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Pick your device</h1>
        <p className="text-sm text-slate-500">This will be the only device you can clock in/out from.</p>
        <ul className="space-y-2">
          {candidates.map(c => (
            <li key={c.mac}>
              <button
                onClick={() => bind(c.mac)}
                disabled={!!submitting}
                className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              >
                <div className="font-medium">{c.hostname ?? 'Unknown device'}</div>
                <div className="text-xs text-slate-500">{c.mac}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-sm text-center text-slate-700">{children}</div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/bind/page.tsx
git commit -m "feat(bind): device picker page"
```

---

## Phase 6 — Clock in/out

### Task 6.1: `/api/clock` — failing tests

**Files:**
- Create: `src/tests/clock.api.test.ts`
- Create: `src/app/api/clock/route.ts`

- [ ] **Step 1: Write failing test for pure helper**

```ts
// src/tests/clock.api.test.ts
import { describe, it, expect } from 'vitest';
import { computeNextAction } from '@/app/api/clock/route';

describe('computeNextAction', () => {
  it('returns clock_in when no open shift', () => {
    expect(computeNextAction(null)).toBe('clock_in');
  });
  it('returns clock_out when an open shift exists', () => {
    expect(computeNextAction({ id: 'x', clock_in_at: '2026-05-14T13:00Z' })).toBe('clock_out');
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- clock.api
```

- [ ] **Step 3: Implement route**

```ts
// src/app/api/clock/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isMacConnected } from '@/lib/unifi';

export const runtime = 'nodejs';

type OpenShift = { id: string; clock_in_at: string } | null;

export function computeNextAction(open: OpenShift): 'clock_in' | 'clock_out' {
  return open ? 'clock_out' : 'clock_in';
}

export async function GET() {
  const { open, status } = await loadStatus();
  if (!open && status === 'unauthorized') return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, open, action: computeNextAction(open) });
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: employee } = await admin
    .from('tt_employees')
    .select('id, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!employee || !employee.active) return NextResponse.json({ ok: false, error: 'no_employee_record' }, { status: 403 });

  const { data: device } = await admin
    .from('tt_devices')
    .select('mac_address')
    .eq('employee_id', employee.id)
    .is('unbound_at', null)
    .maybeSingle();
  if (!device) return NextResponse.json({ ok: false, error: 'no_device_bound' }, { status: 403 });

  // WiFi presence check (the geofence)
  const { connected } = await isMacConnected(device.mac_address);
  if (!connected) return NextResponse.json({ ok: false, error: 'off_wifi' }, { status: 403 });

  const { data: open } = await admin
    .from('tt_shifts')
    .select('id, clock_in_at')
    .eq('employee_id', employee.id)
    .is('clock_out_at', null)
    .maybeSingle();

  const now = new Date().toISOString();
  if (open) {
    const { error } = await admin
      .from('tt_shifts')
      .update({ clock_out_at: now, clock_out_method: 'manual' })
      .eq('id', open.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action: 'clocked_out', at: now });
  }

  const { error } = await admin.from('tt_shifts').insert({
    employee_id: employee.id,
    clock_in_at: now,
    clock_in_method: 'manual',
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: 'clocked_in', at: now });
}

async function loadStatus(): Promise<{ open: OpenShift; status: 'ok' | 'unauthorized' }> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { open: null, status: 'unauthorized' };

  const admin = supabaseAdmin();
  const { data: employee } = await admin
    .from('tt_employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!employee) return { open: null, status: 'unauthorized' };

  const { data: open } = await admin
    .from('tt_shifts')
    .select('id, clock_in_at')
    .eq('employee_id', employee.id)
    .is('clock_out_at', null)
    .maybeSingle();

  return { open, status: 'ok' };
}
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- clock.api
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clock src/tests/clock.api.test.ts
git commit -m "feat(clock): clock in/out API with WiFi gate"
```

### Task 6.2: `/home` clock-in/out UI

**Files:**
- Create: `src/app/home/page.tsx`

- [ ] **Step 1: Implement page**

```tsx
// src/app/home/page.tsx
'use client';
import { useEffect, useState, useTransition } from 'react';

type Status = { ok: boolean; open: { id: string; clock_in_at: string } | null; action: 'clock_in' | 'clock_out' };

export default function HomePage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const r = await fetch('/api/clock');
    if (!r.ok) { setError((await r.json()).error); return; }
    setStatus(await r.json());
  }

  useEffect(() => { refresh(); }, []);

  function act() {
    setError(null);
    startTransition(async () => {
      const r = await fetch('/api/clock', { method: 'POST' });
      const body = await r.json();
      if (!r.ok) { setError(translateError(body.error)); return; }
      await refresh();
    });
  }

  if (!status && !error) return <Centered>Loading…</Centered>;
  if (error && !status) return <Centered>Error: {error}</Centered>;

  const isIn = !!status?.open;
  const since = status?.open ? new Date(status.open.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-6">
        <div>
          <div className="text-sm uppercase tracking-wide text-slate-500">Status</div>
          <div className={`mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            <span className={`h-2 w-2 rounded-full ${isIn ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {isIn ? `Clocked in since ${since}` : 'Clocked out'}
          </div>
        </div>

        <button
          onClick={act}
          disabled={pending}
          className={`w-full rounded-2xl py-6 text-2xl font-semibold text-white ${isIn ? 'bg-rose-600 active:bg-rose-700' : 'bg-emerald-600 active:bg-emerald-700'} disabled:opacity-60`}
        >
          {pending ? '…' : isIn ? 'Clock Out' : 'Clock In'}
        </button>

        {error && <p className="text-sm text-rose-700">{error}</p>}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh flex items-center justify-center p-6"><div className="text-slate-700">{children}</div></main>;
}

function translateError(code: string): string {
  switch (code) {
    case 'off_wifi': return "You're not on the office WiFi. Reconnect and try again.";
    case 'no_device_bound': return 'No device registered. Re-register on office WiFi.';
    case 'no_employee_record': return 'Your account is not active. Talk to your manager.';
    case 'unauthorized': return 'Session expired. Sign in again.';
    default: return code || 'Unknown error';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(home): clock in/out page"
```

---

## Phase 7 — Mismatch alert cron

### Task 7.1: Mismatch scanner — failing test

**Files:**
- Create: `src/tests/mismatch-scan.test.ts`
- Create: `src/app/api/cron/mismatch-scan/route.ts`

- [ ] **Step 1: Write failing test for pure helper**

```ts
// src/tests/mismatch-scan.test.ts
import { describe, it, expect } from 'vitest';
import { isMismatch } from '@/app/api/cron/mismatch-scan/route';

describe('isMismatch', () => {
  const now = new Date('2026-05-14T17:00:00Z');

  it('true when disconnected and last seen >30 min ago', () => {
    expect(isMismatch({ currently_connected: false, last_seen_at: '2026-05-14T16:25:00Z' }, now)).toBe(true);
  });
  it('false when still connected', () => {
    expect(isMismatch({ currently_connected: true, last_seen_at: '2026-05-14T16:59:50Z' }, now)).toBe(false);
  });
  it('false when off WiFi but only briefly', () => {
    expect(isMismatch({ currently_connected: false, last_seen_at: '2026-05-14T16:45:00Z' }, now)).toBe(false);
  });
  it('false when snapshot is null (no data)', () => {
    expect(isMismatch(null, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
npm test -- mismatch-scan
```

- [ ] **Step 3: Implement route**

```ts
// src/app/api/cron/mismatch-scan/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendGhlSms } from '@/lib/ghl';
import { env, adminAlertPhones } from '@/lib/env';

export const runtime = 'nodejs';

const MISMATCH_THRESHOLD_MIN = 30;

export function isMismatch(
  snap: { currently_connected: boolean; last_seen_at: string } | null,
  now: Date,
): boolean {
  if (!snap) return false;
  if (snap.currently_connected) return false;
  const last = new Date(snap.last_seen_at).getTime();
  return now.getTime() - last >= MISMATCH_THRESHOLD_MIN * 60 * 1000;
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = new Date();

  const { data: openShifts, error } = await db
    .from('tt_shifts')
    .select(`id, clock_in_at, employee_id,
             tt_employees!inner(full_name),
             tt_alerts_sent(id)`)
    .is('clock_out_at', null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let alerted = 0;
  for (const shift of openShifts ?? []) {
    // skip already-alerted shifts
    if ((shift as any).tt_alerts_sent?.length) continue;

    const { data: device } = await db
      .from('tt_devices')
      .select('mac_address')
      .eq('employee_id', shift.employee_id)
      .is('unbound_at', null)
      .maybeSingle();
    if (!device) continue;

    const { data: snap } = await db
      .from('tt_client_snapshot')
      .select('currently_connected, last_seen_at')
      .eq('mac_address', device.mac_address)
      .maybeSingle();

    if (!isMismatch(snap, now)) continue;

    const lastSeen = new Date(snap!.last_seen_at);
    const minutes = Math.round((now.getTime() - lastSeen.getTime()) / 60000);
    const name = (shift as any).tt_employees.full_name as string;
    const localTime = lastSeen.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
    const body = `[CFG Time Tracking] ${name} is still clocked in but has been off the office WiFi for ${minutes} min. Last seen at ${localTime} ET. Check the admin app.`;

    const recipients = adminAlertPhones();
    for (const to of recipients) {
      try { await sendGhlSms({ to, body }); } catch (e) { /* swallow per-recipient */ }
    }
    await db.from('tt_alerts_sent').insert({ shift_id: shift.id, recipients });
    alerted++;
  }

  return NextResponse.json({ ok: true, alerted });
}
```

- [ ] **Step 4: Run — passes**

```bash
npm test -- mismatch-scan
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/mismatch-scan src/tests/mismatch-scan.test.ts
git commit -m "feat(cron): mismatch scan + GHL SMS"
```

---

## Phase 8 — Deploy videographer app to Vercel

### Task 8.1: Link Vercel project + set env

- [ ] **Step 1: Link locally**

```bash
cd /Users/braxtonmondell/checkmate-clockin
npx vercel link
```

When prompted, create a new project named `checkmate-clockin`, scope to your team.

- [ ] **Step 2: Set env vars**

For each value, paste from Task 0.1 and your existing GHL/Supabase configs:

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL          production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY     production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY         production
npx vercel env add UNIFI_API_KEY                     production
npx vercel env add UNIFI_SITE_ID                     production
npx vercel env add UNIFI_BASE_URL                    production   # https://api.ui.com
npx vercel env add OFFICE_PUBLIC_IP                  production
npx vercel env add GHL_API_KEY                       production
npx vercel env add GHL_LOCATION_ID                   production
npx vercel env add ADMIN_ALERT_PHONES                production   # +1XXXXXXXXXX,+1YYYYYYYYYY
npx vercel env add CRON_SECRET                       production   # generate: openssl rand -hex 32
```

Repeat for `preview` and `development` environments (you can reuse the same values for development if you're testing against the prod Supabase, which is fine while there's no separate Supabase env).

- [ ] **Step 3: Pull env locally**

```bash
npx vercel env pull .env.local
```

- [ ] **Step 4: Deploy preview to verify build**

```bash
npx vercel
```

Expected: build succeeds, deployment URL printed.

- [ ] **Step 5: Promote to production**

```bash
npx vercel --prod
```

### Task 8.2: Verify in Supabase Auth — add Site URL

- [ ] **Step 1: Add the Vercel URL as an Auth redirect URL**

In Supabase dashboard → Authentication → URL Configuration:
- Add the production URL (e.g. `https://checkmate-clockin.vercel.app`) and the future `https://clockin.checkmatefinancialgroup.com` to **Redirect URLs**.
- Set **Site URL** to the production URL.

### Task 8.3: Live smoke test

- [ ] **Step 1: Add the videographer to `tt_employees`**

Use Supabase MCP `execute_sql`:

```sql
insert into tt_employees (full_name, email, phone, role)
values ('PLACEHOLDER NAME', 'PLACEHOLDER@email.com', '+1XXXXXXXXXX', 'employee');
```

Fill in the videographer's real name/email/phone.

- [ ] **Step 2: Videographer signs in**

On his phone (connected to office WiFi):
1. Open the production URL.
2. Enter his email → tap "Send login link".
3. Open email → tap magic link → lands on `/bind`.
4. See his device in the picker → tap → lands on `/home`.
5. Tap "Clock In" → status updates.
6. Wait 1 minute → check Supabase MCP `execute_sql` `select * from tt_wifi_events order by occurred_at desc limit 5;` — see his MAC in events.
7. Tap "Clock Out" → status flips.

- [ ] **Step 3: Off-WiFi rejection test**

Have him toggle WiFi off on his phone, try to clock in → should see "You're not on the office WiFi. Reconnect and try again."

- [ ] **Step 4: Mismatch alert smoke test**

Clock him in, then physically take his phone off the WiFi for 30+ min (or temporarily reduce the threshold in code, deploy preview, test, then revert). Verify SMS arrives at Obada's number.

---

## Phase 9 — CFG Invoicing: db-time-tracking module (TDD where practical)

> Work in `/Users/braxtonmondell/fuego-leadz` from here on.

### Task 9.1: Create db module skeleton with one tested function

**Files:**
- Create: `src/db-time-tracking.js`
- Create: `tests/db-time-tracking.test.js`

- [ ] **Step 1: Write skeleton + failing test for `weekBounds`**

```js
// src/db-time-tracking.js
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('./supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Pure helpers (tested) ──────────────────────────────────────
function weekBounds(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0 = Sun
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - day);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

module.exports = { weekBounds };
```

```js
// tests/db-time-tracking.test.js
const { weekBounds } = require('../src/db-time-tracking');

test('weekBounds returns Sun..Sun for mid-week', () => {
  const w = weekBounds('2026-05-14'); // Thursday
  expect(w.startIso).toBe('2026-05-10T00:00:00.000Z');
  expect(w.endIso).toBe('2026-05-17T00:00:00.000Z');
});

test('weekBounds for Sunday itself', () => {
  const w = weekBounds('2026-05-10');
  expect(w.startIso).toBe('2026-05-10T00:00:00.000Z');
});
```

- [ ] **Step 2: Run — passes (Jest is already configured)**

```bash
npm test -- db-time-tracking
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/db-time-tracking.js tests/db-time-tracking.test.js
git commit -m "feat(time-tracking): db module skeleton"
```

### Task 9.2: Add query functions (no individual tests; smoke-tested via UI)

The remaining db functions are thin Supabase wrappers — testing each with mocks adds noise vs catching real RLS bugs in manual smoke-test. We test the pure helpers + live-test the queries.

**Files:**
- Modify: `src/db-time-tracking.js`

- [ ] **Step 1: Append all query functions**

```js
// ─── Queries (live-tested) ──────────────────────────────────────

async function listEmployees() {
  const { data, error } = await supabase
    .from('tt_employees')
    .select('id, full_name, email, phone, role, active, created_at')
    .order('full_name');
  if (error) throw error;

  // Pull active devices in one round-trip
  const ids = (data || []).map(e => e.id);
  if (ids.length === 0) return [];
  const { data: devs } = await supabase
    .from('tt_devices')
    .select('employee_id, mac_address, label, bound_at')
    .in('employee_id', ids)
    .is('unbound_at', null);
  const devMap = new Map((devs || []).map(d => [d.employee_id, d]));

  return data.map(e => ({ ...e, device: devMap.get(e.id) || null }));
}

async function createEmployee({ fullName, email, phone, role }) {
  const { data, error } = await supabase
    .from('tt_employees')
    .insert({ full_name: fullName, email, phone, role: role || 'employee' })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

async function updateEmployee(id, patch) {
  const map = {
    full_name: patch.fullName, email: patch.email, phone: patch.phone,
    role: patch.role, active: patch.active,
  };
  const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v !== undefined));
  const { error } = await supabase.from('tt_employees').update(clean).eq('id', id);
  if (error) throw error;
}

async function unbindDevice(employeeId) {
  const { error } = await supabase
    .from('tt_devices')
    .update({ unbound_at: new Date().toISOString() })
    .eq('employee_id', employeeId)
    .is('unbound_at', null);
  if (error) throw error;
}

async function listShifts(employeeId, weekStartIsoDate) {
  const { startIso, endIso } = weekBounds(weekStartIsoDate);
  const { data, error } = await supabase
    .from('tt_shifts')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('clock_in_at', startIso)
    .lt('clock_in_at', endIso)
    .order('clock_in_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function listWifiEventsForShift(shiftId) {
  // Look up the shift to scope the window
  const { data: shift, error: se } = await supabase
    .from('tt_shifts').select('employee_id, clock_in_at, clock_out_at').eq('id', shiftId).single();
  if (se) throw se;
  const from = shift.clock_in_at;
  const to   = shift.clock_out_at || new Date().toISOString();
  const { data, error } = await supabase
    .from('tt_wifi_events')
    .select('id, event_type, occurred_at')
    .eq('employee_id', shift.employee_id)
    .gte('occurred_at', from)
    .lte('occurred_at', to)
    .order('occurred_at');
  if (error) throw error;
  return data;
}

async function editShift(id, patch, adminEmployeeId) {
  const map = {
    clock_in_at: patch.clockInAt,
    clock_out_at: patch.clockOutAt,
    notes: patch.notes,
    clock_out_method: patch.clockOutMethod, // optional
  };
  const clean = Object.fromEntries(Object.entries(map).filter(([, v]) => v !== undefined));
  clean.edited_by = adminEmployeeId;
  clean.edited_at = new Date().toISOString();
  const { error } = await supabase.from('tt_shifts').update(clean).eq('id', id);
  if (error) throw error;
}

async function closeShiftViaAudit(shiftId, adminEmployeeId) {
  const { data: shift, error: se } = await supabase
    .from('tt_shifts').select('id, employee_id').eq('id', shiftId).single();
  if (se) throw se;

  const { data: device } = await supabase
    .from('tt_devices')
    .select('mac_address')
    .eq('employee_id', shift.employee_id)
    .is('unbound_at', null)
    .maybeSingle();
  if (!device) throw new Error('Employee has no bound device');

  const { data: snap } = await supabase
    .from('tt_client_snapshot')
    .select('last_seen_at')
    .eq('mac_address', device.mac_address)
    .single();

  const { error } = await supabase
    .from('tt_shifts')
    .update({
      clock_out_at: snap.last_seen_at,
      clock_out_method: 'admin_audit_close',
      edited_by: adminEmployeeId,
      edited_at: new Date().toISOString(),
    })
    .eq('id', shiftId);
  if (error) throw error;
}

async function listOpenMismatches() {
  // Open shifts where the bound device is currently disconnected AND
  // last_seen_at is >30 min ago.
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: open, error } = await supabase
    .from('tt_shifts')
    .select('id, employee_id, clock_in_at, tt_employees!inner(full_name)')
    .is('clock_out_at', null);
  if (error) throw error;
  if (!open.length) return [];

  const empIds = open.map(s => s.employee_id);
  const { data: devs } = await supabase
    .from('tt_devices').select('employee_id, mac_address')
    .in('employee_id', empIds).is('unbound_at', null);
  const macToEmp = new Map((devs || []).map(d => [d.mac_address, d.employee_id]));
  const macs = [...macToEmp.keys()];
  if (macs.length === 0) return [];

  const { data: snaps } = await supabase
    .from('tt_client_snapshot').select('*').in('mac_address', macs);
  const snapByMac = new Map((snaps || []).map(s => [s.mac_address, s]));

  return open
    .map(s => {
      const mac = (devs || []).find(d => d.employee_id === s.employee_id)?.mac_address;
      const snap = mac ? snapByMac.get(mac) : null;
      if (!snap || snap.currently_connected) return null;
      if (snap.last_seen_at > cutoff) return null;
      return {
        shiftId: s.id,
        employeeName: s.tt_employees.full_name,
        clockInAt: s.clock_in_at,
        lastSeenAt: snap.last_seen_at,
      };
    })
    .filter(Boolean);
}

function subscribeLiveStatus(onChange) {
  const channel = supabase
    .channel('tt-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_shifts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tt_client_snapshot' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function liveStatus() {
  const { data: emps } = await supabase
    .from('tt_employees').select('id, full_name, role, active').eq('active', true).order('full_name');
  const empIds = (emps || []).map(e => e.id);
  const { data: open } = await supabase
    .from('tt_shifts').select('employee_id, clock_in_at')
    .in('employee_id', empIds).is('clock_out_at', null);
  const openMap = new Map((open || []).map(s => [s.employee_id, s]));
  const { data: devs } = await supabase
    .from('tt_devices').select('employee_id, mac_address')
    .in('employee_id', empIds).is('unbound_at', null);
  const macToEmp = new Map((devs || []).map(d => [d.mac_address, d.employee_id]));
  const macs = [...macToEmp.keys()];
  const { data: snaps } = macs.length
    ? await supabase.from('tt_client_snapshot').select('mac_address, currently_connected').in('mac_address', macs)
    : { data: [] };
  const macConnected = new Map((snaps || []).map(s => [s.mac_address, s.currently_connected]));

  return (emps || []).map(e => {
    const mac = (devs || []).find(d => d.employee_id === e.id)?.mac_address;
    return {
      id: e.id,
      fullName: e.full_name,
      role: e.role,
      clockedInSince: openMap.get(e.id)?.clock_in_at || null,
      wifiConnected: mac ? !!macConnected.get(mac) : false,
    };
  });
}

module.exports = {
  weekBounds,
  listEmployees,
  createEmployee,
  updateEmployee,
  unbindDevice,
  listShifts,
  listWifiEventsForShift,
  editShift,
  closeShiftViaAudit,
  listOpenMismatches,
  liveStatus,
  subscribeLiveStatus,
};
```

- [ ] **Step 2: Run existing tests (should still pass)**

```bash
npm test
```

Expected: all tests pass — the pure helper test plus all pre-existing tests.

- [ ] **Step 3: Commit**

```bash
git add src/db-time-tracking.js
git commit -m "feat(time-tracking): db query functions"
```

---

## Phase 10 — CFG Invoicing: IPC + preload

### Task 10.1: Register IPC handlers in `main.js`

**Files:**
- Modify: `main.js`

- [ ] **Step 1: Find the existing `db:*` ipcMain handlers**

Open `main.js`, locate the block where `ipcMain.handle('db:getClients', ...)` and friends are registered.

- [ ] **Step 2: Add a `require` and a new handler block right after the existing db block**

Add near the other requires at the top:

```js
const tt = require('./src/db-time-tracking');
```

Add the handler block right after the `db:*` handlers:

```js
// ─── Time Tracking IPC ─────────────────────────────────────────
ipcMain.handle('tt:listEmployees',           ()                      => tt.listEmployees());
ipcMain.handle('tt:createEmployee',          (_e, data)              => tt.createEmployee(data));
ipcMain.handle('tt:updateEmployee',          (_e, id, patch)         => tt.updateEmployee(id, patch));
ipcMain.handle('tt:unbindDevice',            (_e, employeeId)        => tt.unbindDevice(employeeId));
ipcMain.handle('tt:listShifts',              (_e, employeeId, week)  => tt.listShifts(employeeId, week));
ipcMain.handle('tt:listWifiEventsForShift',  (_e, shiftId)           => tt.listWifiEventsForShift(shiftId));
ipcMain.handle('tt:editShift',               (_e, id, patch, admin)  => tt.editShift(id, patch, admin));
ipcMain.handle('tt:closeShiftViaAudit',      (_e, shiftId, admin)    => tt.closeShiftViaAudit(shiftId, admin));
ipcMain.handle('tt:listOpenMismatches',      ()                      => tt.listOpenMismatches());
ipcMain.handle('tt:liveStatus',              ()                      => tt.liveStatus());
```

- [ ] **Step 3: Commit**

```bash
git add main.js
git commit -m "feat(time-tracking): IPC handlers in main process"
```

### Task 10.2: Expose API via preload

**Files:**
- Modify: `preload.js`

- [ ] **Step 1: Add a `timeTracking` namespace inside the existing `contextBridge.exposeInMainWorld('api', { ... })` object**

Insert before the closing `}` of the api object:

```js
  timeTracking: {
    listEmployees:          ()                       => ipcRenderer.invoke('tt:listEmployees'),
    createEmployee:         (data)                   => ipcRenderer.invoke('tt:createEmployee', data),
    updateEmployee:         (id, patch)              => ipcRenderer.invoke('tt:updateEmployee', id, patch),
    unbindDevice:           (employeeId)             => ipcRenderer.invoke('tt:unbindDevice', employeeId),
    listShifts:             (employeeId, week)       => ipcRenderer.invoke('tt:listShifts', employeeId, week),
    listWifiEventsForShift: (shiftId)                => ipcRenderer.invoke('tt:listWifiEventsForShift', shiftId),
    editShift:              (id, patch, adminId)     => ipcRenderer.invoke('tt:editShift', id, patch, adminId),
    closeShiftViaAudit:     (shiftId, adminId)       => ipcRenderer.invoke('tt:closeShiftViaAudit', shiftId, adminId),
    listOpenMismatches:     ()                       => ipcRenderer.invoke('tt:listOpenMismatches'),
    liveStatus:             ()                       => ipcRenderer.invoke('tt:liveStatus'),
  },
```

- [ ] **Step 2: Commit**

```bash
git add preload.js
git commit -m "feat(time-tracking): preload bridge"
```

> **Note on realtime:** `subscribeLiveStatus` from db-time-tracking.js opens a Supabase realtime channel. In Electron's main process that works, but pushing change events through IPC to the renderer needs a bidirectional channel. For v1 we use polling (5s refresh from the renderer) — keep the subscribe function in the db module for a future enhancement but don't expose it via IPC yet. The renderer's Live tab uses `setInterval` to call `liveStatus()` every 5s, which is plenty for a 1–3 person team.

---

## Phase 11 — CFG Invoicing: screen UI

### Task 11.1: Skeleton screen + nav entry

**Files:**
- Create: `renderer/screens/time-tracking.js`
- Modify: `renderer/app.js`
- Modify: `renderer/index.html`

- [ ] **Step 1: Look at an existing screen for the pattern**

Read `renderer/screens/clients.js` to confirm the screen export convention (typically a function that mounts into a container element).

- [ ] **Step 2: Create the skeleton**

```js
// renderer/screens/time-tracking.js
const SUB_TABS = ['live', 'timesheets', 'employees', 'alerts'];

function render(container, params) {
  const tab = params?.tab || 'live';

  container.innerHTML = `
    <div class="screen time-tracking">
      <header class="screen-header">
        <h1>Time Tracking</h1>
      </header>
      <nav class="tt-subtabs">
        ${SUB_TABS.map(t => `
          <button class="tt-subtab ${t === tab ? 'active' : ''}" data-tab="${t}">
            ${t.charAt(0).toUpperCase() + t.slice(1)}
          </button>`).join('')}
      </nav>
      <section id="tt-body" class="tt-body"></section>
    </div>
  `;

  container.querySelectorAll('.tt-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      window.navigate('time-tracking', { tab: btn.dataset.tab });
    });
  });

  const body = container.querySelector('#tt-body');
  switch (tab) {
    case 'live':       return renderLive(body);
    case 'timesheets': return renderTimesheets(body);
    case 'employees':  return renderEmployees(body);
    case 'alerts':     return renderAlerts(body);
  }
}

function renderLive(body) {
  body.innerHTML = '<p>Live view — Task 11.2</p>';
}
function renderTimesheets(body) {
  body.innerHTML = '<p>Timesheets — Task 11.5</p>';
}
function renderEmployees(body) {
  body.innerHTML = '<p>Employees — Task 11.3</p>';
}
function renderAlerts(body) {
  body.innerHTML = '<p>Alerts — Task 11.7</p>';
}

module.exports = { render };
```

- [ ] **Step 3: Register the screen in `renderer/app.js`**

Find the router switch (the `navigate` function). Add a case:

```js
case 'time-tracking':
  require('./screens/time-tracking').render(container, params);
  break;
```

- [ ] **Step 4: Add the nav button in `renderer/index.html`**

In the existing nav element (look for the buttons like "Clients", "Invoices", "Contractors"), add:

```html
<button class="nav-btn" onclick="navigate('time-tracking')">Time Tracking</button>
```

- [ ] **Step 5: Smoke-test**

```bash
npm start
```

Click the new "Time Tracking" nav button. Confirm the four sub-tabs render and switch. Body shows the placeholder text per tab.

- [ ] **Step 6: Commit**

```bash
git add renderer/screens/time-tracking.js renderer/app.js renderer/index.html
git commit -m "feat(time-tracking): skeleton screen + nav"
```

### Task 11.2: Live sub-tab

**Files:**
- Modify: `renderer/screens/time-tracking.js`

- [ ] **Step 1: Replace `renderLive`**

```js
async function renderLive(body) {
  body.innerHTML = '<p>Loading…</p>';
  const tick = async () => {
    try {
      const rows = await window.api.timeTracking.liveStatus();
      body.innerHTML = `
        <table class="tt-live-table">
          <thead><tr>
            <th>Name</th><th>Status</th><th>Clocked in since</th><th>WiFi</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.fullName)}</td>
                <td>${r.clockedInSince ? '<span class="pill pill-green">Clocked In</span>' : '<span class="pill pill-gray">Clocked Out</span>'}</td>
                <td>${r.clockedInSince ? formatTime(r.clockedInSince) : '—'}</td>
                <td>${r.wifiConnected ? '<span class="dot dot-green"></span> Connected' : '<span class="dot dot-red"></span> Off'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      body.innerHTML = `<p class="error">Error: ${escapeHtml(String(e.message || e))}</p>`;
    }
  };
  await tick();
  const id = setInterval(tick, 5000);
  body.dataset.intervalId = id;
}

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
```

> **Cleanup:** When `render()` runs again for a different sub-tab, the interval keeps firing on the orphaned element. Add a guard at the top of `render()` before re-painting:

In the existing `render` function, before `container.innerHTML = ...`, insert:

```js
const prevInterval = container.querySelector('#tt-body')?.dataset.intervalId;
if (prevInterval) clearInterval(Number(prevInterval));
```

- [ ] **Step 2: Smoke-test**

`npm start` → Time Tracking → Live tab. Confirm the videographer row shows up; toggle his WiFi (or watch over time) and confirm the WiFi column changes within 5s.

- [ ] **Step 3: Commit**

```bash
git add renderer/screens/time-tracking.js
git commit -m "feat(time-tracking): live view"
```

### Task 11.3: Employees sub-tab — list + add

**Files:**
- Modify: `renderer/screens/time-tracking.js`

- [ ] **Step 1: Replace `renderEmployees`**

```js
async function renderEmployees(body) {
  body.innerHTML = '<p>Loading…</p>';
  let rows;
  try { rows = await window.api.timeTracking.listEmployees(); }
  catch (e) { body.innerHTML = `<p class="error">${escapeHtml(String(e.message || e))}</p>`; return; }

  body.innerHTML = `
    <div class="tt-emp-actions">
      <button id="tt-emp-add" class="btn-primary">+ Add Employee</button>
    </div>
    <table class="tt-emp-table">
      <thead><tr>
        <th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Active</th><th>Device</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-id="${r.id}">
            <td>${escapeHtml(r.full_name)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td>${escapeHtml(r.phone || '')}</td>
            <td>${r.role}</td>
            <td>${r.active ? 'Yes' : 'No'}</td>
            <td>${r.device ? escapeHtml(r.device.label || r.device.mac_address) : '<span class="muted">—</span>'}</td>
            <td>
              <button data-action="toggle-active">${r.active ? 'Disable' : 'Enable'}</button>
              ${r.device ? `<button data-action="unbind">Unbind</button>` : ''}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  body.querySelector('#tt-emp-add').addEventListener('click', () => openAddEmployeeModal(body));

  body.querySelectorAll('tr[data-id]').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('[data-action="toggle-active"]')?.addEventListener('click', async () => {
      const row = rows.find(r => r.id === id);
      await window.api.timeTracking.updateEmployee(id, { active: !row.active });
      renderEmployees(body);
    });
    tr.querySelector('[data-action="unbind"]')?.addEventListener('click', async () => {
      if (!confirm('Unbind this employee\'s device? They will need to re-register on office WiFi.')) return;
      await window.api.timeTracking.unbindDevice(id);
      renderEmployees(body);
    });
  });
}

function openAddEmployeeModal(body) {
  const modal = document.createElement('div');
  modal.className = 'tt-modal';
  modal.innerHTML = `
    <div class="tt-modal-inner">
      <h2>Add Employee</h2>
      <label>Full name <input name="fullName" required></label>
      <label>Email <input name="email" type="email" required></label>
      <label>Phone <input name="phone" placeholder="+1XXXXXXXXXX"></label>
      <label>Role
        <select name="role">
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div class="tt-modal-actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="save" class="btn-primary">Save</button>
      </div>
      <p class="tt-modal-error error" hidden></p>
    </div>`;
  document.body.appendChild(modal);
  const get = (n) => modal.querySelector(`[name="${n}"]`).value.trim();
  const errEl = modal.querySelector('.tt-modal-error');

  modal.querySelector('[data-action="cancel"]').onclick = () => modal.remove();
  modal.querySelector('[data-action="save"]').onclick = async () => {
    errEl.hidden = true;
    try {
      await window.api.timeTracking.createEmployee({
        fullName: get('fullName'), email: get('email'), phone: get('phone') || null, role: get('role'),
      });
      modal.remove();
      renderEmployees(body);
    } catch (e) {
      errEl.textContent = String(e.message || e); errEl.hidden = false;
    }
  };
}
```

- [ ] **Step 2: Smoke-test**

`npm start` → Employees tab. Confirm Obada shows up. Click "+ Add Employee", create a test record, confirm it lists. Toggle active, confirm flip. Don't unbind yet (no real device bound).

- [ ] **Step 3: Commit**

```bash
git add renderer/screens/time-tracking.js
git commit -m "feat(time-tracking): employees tab (list + add + toggle + unbind)"
```

### Task 11.4: Timesheets sub-tab — list + audit timeline

**Files:**
- Modify: `renderer/screens/time-tracking.js`

- [ ] **Step 1: Replace `renderTimesheets`**

```js
async function renderTimesheets(body) {
  body.innerHTML = '<p>Loading…</p>';
  const emps = await window.api.timeTracking.listEmployees();
  if (!emps.length) { body.innerHTML = '<p class="muted">No employees yet.</p>'; return; }

  const todayIso = new Date().toISOString().slice(0, 10);
  body.innerHTML = `
    <div class="tt-ts-controls">
      <label>Employee
        <select id="tt-ts-emp">
          ${emps.map(e => `<option value="${e.id}">${escapeHtml(e.full_name)}</option>`).join('')}
        </select>
      </label>
      <label>Week of <input id="tt-ts-week" type="date" value="${todayIso}"></label>
      <button id="tt-ts-load" class="btn-primary">Load</button>
    </div>
    <div id="tt-ts-shifts"></div>
  `;

  const load = async () => {
    const empId = body.querySelector('#tt-ts-emp').value;
    const week = body.querySelector('#tt-ts-week').value;
    const list = body.querySelector('#tt-ts-shifts');
    list.innerHTML = '<p>Loading…</p>';
    const shifts = await window.api.timeTracking.listShifts(empId, week);
    if (!shifts.length) { list.innerHTML = '<p class="muted">No shifts this week.</p>'; return; }

    list.innerHTML = shifts.map(s => `
      <div class="tt-shift" data-shift-id="${s.id}">
        <div class="tt-shift-row">
          <div>${formatDate(s.clock_in_at)}</div>
          <div>${formatTime(s.clock_in_at)} → ${s.clock_out_at ? formatTime(s.clock_out_at) : '<em>open</em>'}</div>
          <div>${durationLabel(s.clock_in_at, s.clock_out_at)}</div>
          <div>${s.clock_in_method}${s.clock_out_method ? ` / ${s.clock_out_method}` : ''}</div>
          <div>
            <button data-action="edit">Edit</button>
            <button data-action="audit">WiFi audit</button>
          </div>
        </div>
        <div class="tt-shift-audit" hidden></div>
      </div>`).join('');

    list.querySelectorAll('.tt-shift').forEach(card => {
      const id = card.dataset.shiftId;
      const shift = shifts.find(x => x.id === id);
      card.querySelector('[data-action="edit"]').onclick = () => openEditShiftModal(shift, () => load());
      card.querySelector('[data-action="audit"]').onclick = async () => {
        const audit = card.querySelector('.tt-shift-audit');
        if (!audit.hidden) { audit.hidden = true; return; }
        audit.innerHTML = 'Loading…';
        audit.hidden = false;
        const evts = await window.api.timeTracking.listWifiEventsForShift(id);
        audit.innerHTML = `
          <ul class="tt-audit-list">
            ${evts.map(e => `<li><span class="dot ${e.event_type === 'connect' ? 'dot-green' : 'dot-red'}"></span> ${e.event_type} at ${formatTime(e.occurred_at)}</li>`).join('') || '<li class="muted">No WiFi events in this window.</li>'}
          </ul>`;
      };
    });
  };

  body.querySelector('#tt-ts-load').onclick = load;
  load();
}

function formatDate(iso) { return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); }
function durationLabel(a, b) {
  if (!b) return '—';
  const ms = new Date(b) - new Date(a);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function openEditShiftModal(shift, onSaved) {
  const m = document.createElement('div');
  m.className = 'tt-modal';
  m.innerHTML = `
    <div class="tt-modal-inner">
      <h2>Edit Shift</h2>
      <label>Clock In <input name="in" type="datetime-local" value="${toLocalInput(shift.clock_in_at)}"></label>
      <label>Clock Out <input name="out" type="datetime-local" value="${shift.clock_out_at ? toLocalInput(shift.clock_out_at) : ''}"></label>
      <label>Notes <textarea name="notes" rows="3">${escapeHtml(shift.notes || '')}</textarea></label>
      <div class="tt-modal-actions">
        <button data-action="cancel">Cancel</button>
        <button data-action="save" class="btn-primary">Save</button>
      </div>
      <p class="tt-modal-error error" hidden></p>
    </div>`;
  document.body.appendChild(m);
  const val = (n) => m.querySelector(`[name="${n}"]`).value;
  const err = m.querySelector('.tt-modal-error');
  m.querySelector('[data-action="cancel"]').onclick = () => m.remove();
  m.querySelector('[data-action="save"]').onclick = async () => {
    err.hidden = true;
    try {
      await window.api.timeTracking.editShift(shift.id, {
        clockInAt: new Date(val('in')).toISOString(),
        clockOutAt: val('out') ? new Date(val('out')).toISOString() : null,
        notes: val('notes'),
        clockOutMethod: val('out') ? 'admin_edit' : null,
      }, await getCurrentAdminId());
      m.remove(); onSaved();
    } catch (e) { err.textContent = String(e.message || e); err.hidden = false; }
  };
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin identity — for v1 we hardcode by env email
async function getCurrentAdminId() {
  // For now: look up by hardcoded admin email. Replace with auth flow later.
  const emps = await window.api.timeTracking.listEmployees();
  return emps.find(e => e.email === 'obada@checkmatefinancialgroup.com')?.id;
}
```

- [ ] **Step 2: Smoke-test**

`npm start` → Timesheets → pick the videographer → click Load. See his shifts. Click "WiFi audit" → see events. Click "Edit" → modify clock_out_at → Save → reload, confirm change.

- [ ] **Step 3: Commit**

```bash
git add renderer/screens/time-tracking.js
git commit -m "feat(time-tracking): timesheets view + edit modal + audit timeline"
```

### Task 11.5: Alerts sub-tab

**Files:**
- Modify: `renderer/screens/time-tracking.js`

- [ ] **Step 1: Replace `renderAlerts`**

```js
async function renderAlerts(body) {
  body.innerHTML = '<p>Loading…</p>';
  let rows;
  try { rows = await window.api.timeTracking.listOpenMismatches(); }
  catch (e) { body.innerHTML = `<p class="error">${escapeHtml(String(e.message || e))}</p>`; return; }

  if (!rows.length) { body.innerHTML = '<p class="muted">No mismatches right now.</p>'; return; }

  body.innerHTML = `
    <table class="tt-alerts-table">
      <thead><tr>
        <th>Employee</th><th>Clocked in</th><th>Last seen on WiFi</th><th>Off for</th><th>Action</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr data-shift-id="${r.shiftId}">
            <td>${escapeHtml(r.employeeName)}</td>
            <td>${formatTime(r.clockInAt)}</td>
            <td>${formatTime(r.lastSeenAt)}</td>
            <td>${minutesAgo(r.lastSeenAt)} min</td>
            <td><button data-action="close" class="btn-primary">Close at last-seen</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  body.querySelectorAll('tr[data-shift-id]').forEach(tr => {
    tr.querySelector('[data-action="close"]').onclick = async () => {
      if (!confirm('Close this shift at the last WiFi-seen timestamp?')) return;
      try {
        await window.api.timeTracking.closeShiftViaAudit(tr.dataset.shiftId, await getCurrentAdminId());
        renderAlerts(body);
      } catch (e) {
        alert('Error: ' + (e.message || e));
      }
    };
  });
}

function minutesAgo(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}
```

- [ ] **Step 2: Smoke-test**

Hard to test without a live mismatch. Either:
- Wait for one in production, OR
- Temporarily insert a fake `tt_alerts_sent` clearance + tweak `tt_client_snapshot.last_seen_at` for the videographer's MAC to 45 min ago via Supabase MCP — confirm the row appears, click "Close at last-seen", confirm the shift closes.

- [ ] **Step 3: Commit**

```bash
git add renderer/screens/time-tracking.js
git commit -m "feat(time-tracking): alerts tab with audit-close button"
```

### Task 11.6: Styles

**Files:**
- Modify: `renderer/styles.css` (or wherever the app's CSS lives)

- [ ] **Step 1: Find the existing style file**

```bash
ls renderer/*.css 2>/dev/null
```

(If the codebase has per-screen CSS or inline styles, follow that pattern instead.)

- [ ] **Step 2: Append time-tracking styles**

```css
/* ─── Time Tracking ──────────────────────────────────────────── */
.tt-subtabs { display:flex; gap:.5rem; margin:1rem 0; }
.tt-subtab { padding:.5rem 1rem; border:1px solid #d1d5db; border-radius:.5rem; background:white; cursor:pointer; }
.tt-subtab.active { background:#111827; color:white; border-color:#111827; }
.tt-body { padding:1rem 0; }

.tt-live-table, .tt-emp-table, .tt-alerts-table { width:100%; border-collapse:collapse; }
.tt-live-table th, .tt-live-table td, .tt-emp-table th, .tt-emp-table td, .tt-alerts-table th, .tt-alerts-table td {
  padding:.5rem .75rem; border-bottom:1px solid #f3f4f6; text-align:left; vertical-align:middle;
}
.pill { display:inline-block; padding:.125rem .5rem; border-radius:9999px; font-size:.75rem; font-weight:600; }
.pill-green { background:#dcfce7; color:#166534; }
.pill-gray  { background:#f3f4f6; color:#374151; }
.dot { display:inline-block; width:.5rem; height:.5rem; border-radius:9999px; vertical-align:middle; margin-right:.25rem; }
.dot-green { background:#22c55e; }
.dot-red   { background:#ef4444; }
.muted { color:#6b7280; }
.error { color:#b91c1c; }

.tt-emp-actions { margin-bottom:.75rem; }
.btn-primary { background:#111827; color:white; border:none; padding:.5rem .9rem; border-radius:.5rem; cursor:pointer; }
.btn-primary:hover { background:#1f2937; }

.tt-ts-controls { display:flex; gap:1rem; align-items:end; margin-bottom:1rem; }
.tt-ts-controls label { display:flex; flex-direction:column; font-size:.875rem; }
.tt-shift { border:1px solid #e5e7eb; border-radius:.5rem; margin-bottom:.5rem; }
.tt-shift-row { display:grid; grid-template-columns: 1.2fr 1.4fr .8fr 1.2fr 1fr; gap:1rem; padding:.6rem .75rem; align-items:center; }
.tt-shift-audit { padding:.5rem 1rem; background:#f9fafb; border-top:1px solid #e5e7eb; }
.tt-audit-list { list-style:none; padding:0; margin:0; }
.tt-audit-list li { padding:.25rem 0; font-size:.875rem; }

.tt-modal { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
.tt-modal-inner { background:white; padding:1.5rem; border-radius:1rem; width:min(90vw, 420px); }
.tt-modal-inner label { display:block; margin-bottom:.75rem; font-size:.875rem; }
.tt-modal-inner input, .tt-modal-inner select, .tt-modal-inner textarea { width:100%; padding:.4rem .5rem; border:1px solid #d1d5db; border-radius:.5rem; }
.tt-modal-actions { display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }
```

- [ ] **Step 2: Commit**

```bash
git add renderer/styles.css
git commit -m "style(time-tracking): tab + table + modal styles"
```

(If the CSS file path differs, adjust the `git add` accordingly.)

---

## Phase 12 — Release CFG Invoicing v1.0.4

### Task 12.1: Bump + tag + push

- [ ] **Step 1: Bump version**

Edit `package.json` `"version"` from `"1.0.3"` to `"1.0.4"`.

- [ ] **Step 2: Commit + tag + push**

```bash
git add package.json
git commit -m "chore: bump to v1.0.4 — time tracking tab"
git tag -a v1.0.4 -m "v1.0.4 — Time Tracking admin tab"
git push origin main
git push origin v1.0.4
```

- [ ] **Step 3: Wait for `release.yml` workflow**

```bash
gh run watch
```

Expected: workflow finishes; a draft release `v1.0.4` is created with DMG + `latest-mac.yml`.

### Task 12.2: Publish the draft (MANDATORY)

- [ ] **Step 1: Publish**

```bash
gh release edit v1.0.4 --draft=false \
  --title "v1.0.4 — Time Tracking" \
  --notes "Adds the Time Tracking tab with Live status, Timesheets, Employees, and Alerts. Pairs with the new clockin web app."
```

- [ ] **Step 2: Verify it is not draft**

```bash
gh release view v1.0.4 --json isDraft -q .isDraft
```

Expected: `false`.

### Task 12.3: Auto-update smoke test

- [ ] **Step 1: Launch the previously-installed v1.0.3 on a Mac**

Within ~5 minutes, the in-app update modal should appear with the v1.0.4 release notes. Click Restart and confirm the new Time Tracking tab is present.

---

## Phase 13 — Future: subdomain cutover (deferred)

When you're ready to switch from `<project>.vercel.app` to `clockin.checkmatefinancialgroup.com`:

- [ ] Add CNAME `clockin → cname.vercel-dns.com` at your DNS provider
- [ ] In Vercel dashboard for `checkmate-clockin` → Domains → add `clockin.checkmatefinancialgroup.com`
- [ ] In Supabase Auth → URL Configuration → add the new URL to Redirect URLs and update Site URL
- [ ] Bookmark the new URL on the videographer's phone

No code change required.

---

## Self-Review Checklist (run by writer before handing off)

**1. Spec coverage:**
- Architecture (spec §2) → Phase 0–12 cover both repos. ✓
- Data model (spec §3) → Task 1.1 includes all 7 tables. ✓
- Videographer web app (spec §4) → Phase 4–6. ✓
- Admin tab (spec §5) → Phase 9–11 (Live/Timesheets/Employees/Alerts). ✓
- UniFi polling (spec §6) → Phase 3. ✓
- Mismatch alerts (spec §7) → Phase 7 + Task 11.5 (Alerts UI). ✓
- Env/secrets (spec §8) → Task 0.1 + Task 8.1. ✓
- Prerequisites (spec §9) → Phase 0. ✓
- Open items (spec §11) → admin identity resolved in `getCurrentAdminId()` (Task 11.4); GHL location confirmed via env in Task 0.1. ✓

**2. Placeholder scan:** All code blocks contain runnable code. No "TBD"/"TODO" inside steps. ✓ (Two `PLACEHOLDER` strings exist intentionally in Task 8.3 step 1 — those are values the user fills in at runtime, marked explicitly.) ✓

**3. Type/name consistency:**
- `tt_employees.full_name` used consistently in SQL and JS. ✓
- `clock_in_at` / `clock_out_at` consistent across spec, SQL, db module, IPC, screen. ✓
- `tt_devices.unbound_at` predicate `IS NULL` used consistently for "active device". ✓
- `subscribeLiveStatus` exists in db module but explicitly not exposed via IPC for v1 — Task 10.2 calls this out. ✓

**4. Frequent commits:** Every task ends in a commit. Phases group into ~3–6 commits each. ✓

---

## Execution Handoff

Plan complete and saved to `/Users/braxtonmondell/fuego-leadz/docs/superpowers/plans/2026-05-14-time-tracking.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan this size — keeps the main context clean.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
