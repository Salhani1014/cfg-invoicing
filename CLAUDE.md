# Fuego Leadz Invoice Manager — Claude Context

## What This Is
An Electron desktop app for Fuego Leadz LLC to manage ad leads clients, generate PDF invoices, email them, and visualize revenue.

## Business Details
- **Entity:** Fuego Leadz LLC (FL LLC, Doc# L26000085126)
- **Principal Address:** 5728 Major Blvd, Suite 702, Orlando, FL 32819
- **Payment Terms:** Due upon receipt

## Tech Stack
- Electron 28 (desktop shell)
- Supabase (PostgreSQL via @supabase/supabase-js v2 — remote DB)
- Nodemailer (email via Gmail SMTP + App Password)
- Chart.js (analytics, loaded from CDN)
- Vanilla JS/HTML/CSS (no framework)
- Jest (unit tests)

## Architecture
- **main.js** — Electron main process, all IPC handlers (db, pdf, mail, settings, dialog)
- **preload.js** — contextBridge exposing window.api to renderer
- **src/db.js** — Supabase queries for clients, invoices
- **src/db-contractors.js** — Supabase queries for contractors and contractor_payments
- **src/pdf-generator.js** — renders hidden BrowserWindow, calls printToPDF
- **src/mailer.js** — Nodemailer email + PDF attachment
- **src/invoice-number.js** — INV and PS number generators
- **renderer/app.js** — screen router (navigate(screenName, params))
- **renderer/screens/** — clients, create-invoice, bulk-invoice, contractors, dashboard, settings
- **renderer/invoice-template/template.html** — standalone HTML rendered to PDF
- **renderer/pay-stub-template/template.html** — corporate white pay stub rendered to PDF

## Lead Products
1. Trucker IUL Leads
2. Spanish IUL Leads
3. Widow of Veteran Leads

## Invoice Number Format
`INV-YYYY-MMDD-[LAST4][FIRST_INITIAL]-[6RANDOM]`
Example: `INV-2026-0419-SMITJ-847392`

## Pay Stub Number Format
`PS-YYYY-MMDD-[FIRST4]-[6RANDOM]` (FIRST4 = first 4 chars of contractor's first word)
Example: `PS-2026-0420-SANT-847392`

## Data Storage
Supabase (PostgreSQL). Tables: clients, invoices, invoice_line_items, settings, contractors, contractor_payments

## Status Badge Logic
- Green "Up to Date" — last invoice < 6 days ago
- Yellow "Due Soon" — last invoice exactly 6 days ago
- Red "Overdue" — last invoice 7+ days ago, or never invoiced

## Pending
- Add Fuego Leadz logo to invoice header when available
- Fill in payment method details in Settings once decided
- Recurring invoice reminders / auto-send
