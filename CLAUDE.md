# Fuego Leadz Invoice Manager — Claude Context

## What This Is
An Electron desktop app for Fuego Leadz LLC to manage ad leads clients, generate PDF invoices, email them, and visualize revenue.

## Business Details
- **Entity:** Fuego Leadz LLC (FL LLC, Doc# L26000085126)
- **Principal Address:** 5728 Major Blvd, Suite 702, Orlando, FL 32819
- **Payment Terms:** Due upon receipt

## Tech Stack
- Electron 28 (desktop shell)
- better-sqlite3 (local database)
- Nodemailer (email via Gmail SMTP + App Password)
- Chart.js (analytics, loaded from CDN)
- Vanilla JS/HTML/CSS (no framework)
- Jest (unit tests)

## Architecture
- **main.js** — Electron main process, all IPC handlers (db, pdf, mail, settings, dialog)
- **preload.js** — contextBridge exposing window.api to renderer
- **src/db.js** — SQLite schema + all queries
- **src/pdf-generator.js** — renders hidden BrowserWindow, calls printToPDF
- **src/mailer.js** — Nodemailer email + PDF attachment
- **src/invoice-number.js** — INV-YYYY-MMDD-LASTF-SEQ format
- **renderer/app.js** — screen router (navigate(screenName, params))
- **renderer/screens/** — clients, create-invoice, dashboard, settings
- **renderer/invoice-template/template.html** — standalone HTML rendered to PDF

## Lead Products
1. Trucker IUL Leads
2. Spanish IUL Leads
3. Widow of Veteran Leads

## Invoice Number Format
`INV-YYYY-MMDD-[LAST4][FIRST_INITIAL]-[SEQ3]`
Example: `INV-2026-0419-SMITJ-001`
Sequence is per-client (resets at 1 for each new client).

## Data Storage
SQLite at `app.getPath('userData')/fuego-leadz.db`
Tables: clients, invoices, invoice_line_items, settings

## Status Badge Logic
- Green "Up to Date" — last invoice < 6 days ago
- Yellow "Due Soon" — last invoice exactly 6 days ago
- Red "Overdue" — last invoice 7+ days ago, or never invoiced

## Pending
- Add Fuego Leadz logo to invoice header when available
- Fill in payment method details in Settings once decided
- Recurring invoice reminders / auto-send
