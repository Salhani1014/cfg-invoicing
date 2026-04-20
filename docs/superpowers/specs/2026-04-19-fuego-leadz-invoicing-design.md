# Fuego Leadz Invoice Manager — Design Spec

## Goal
A premium Electron desktop app for Fuego Leadz LLC to manage ad leads clients, generate professional invoices, email them, and track revenue over time.

## Business Details
- **Entity:** Fuego Leadz LLC (Florida LLC, Document #L26000085126)
- **Principal Address:** 5728 Major Blvd, Suite 702, Orlando, FL 32819
- **Email:** Fuego Leadz business email (SMTP setup required during build)
- **Payment Terms:** Due upon receipt
- **Payment Methods:** Zelle, bank transfer, PayPal, other (placeholder — owner to fill in details)

## Lead Products
1. Trucker IUL Leads
2. Spanish IUL Leads
3. Widow of Veteran Leads

Clients may order one or more product types per invoice.

---

## Architecture

**Stack:** Electron + HTML/CSS/JS frontend + SQLite (via better-sqlite3) for local data storage + Puppeteer or electron-pdf for PDF generation + Nodemailer for email.

**Data:** All data stored locally in SQLite on the user's Mac. No cloud, no internet required except for sending email.

**PDF Storage:** User selects a base folder once (saved in app settings). Each client gets a subfolder. PDFs are named by invoice number.

---

## Screens

### 1. Client List (Home / Sunday View)
The default screen when the app opens.

**Elements:**
- Search bar to filter by name
- Table columns: Name, Email, Phone, Last Invoice Date, Last Invoice Amount, Status Badge, Actions
- **Status badges:**
  - 🟢 Up to Date — invoiced within last 6 days
  - 🟡 Due Soon — last invoice was 6 days ago
  - 🔴 Overdue — last invoice was 7+ days ago, or never invoiced
- "New Invoice" button on each row
- "Add Client" button top-right
- Navigation to Dashboard

### 2. Add / Edit Client
Form fields:
- First Name, Last Name (separate fields)
- Email
- Phone Number
- Save / Cancel buttons

Validation: email format required, phone required.

### 3. Create Invoice
**Fields:**
- Client (pre-selected if launched from client row)
- Invoice Date (date picker, defaults to today)
- Lead type selector — checkboxes, can select multiple:
  - [ ] Trucker IUL Leads
  - [ ] Spanish IUL Leads
  - [ ] Widow of Veteran Leads
- Per selected lead type:
  - Amount purchased (number input)
  - Unit price (dollar amount)
  - Guaranteed minimum (optional — if blank, omitted from invoice)
- Invoice totals calculated live
- "Generate & Send" button — generates PDF, saves to folder, emails client
- "Generate Only" button — generates PDF and saves without emailing

**Invoice Number Format:** `INV-YYYY-MMDD-[LASTNAMEFIRST4]-[SEQ3]`
Example: `INV-2026-0419-SMIT-001`

Sequential number resets per client, not globally.

### 4. Analytics Dashboard
**Summary cards (top row):**
- Total invoiced all-time
- Total invoiced this month
- Number of active clients
- Number of invoices sent this month

**Charts:**
- **Revenue over time** — bar chart, toggle between weekly and monthly view
- **Top clients** — horizontal bar chart, top clients by total invoiced
- **Lead type breakdown** — donut chart showing revenue split by lead type

**Time range filter:** Last 30 days / Last 90 days / This year / All time

Charts built with Chart.js (lightweight, no backend needed).

---

## Invoice PDF Design

**Color scheme:** Black and gold — premium feel.

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  [LOGO PLACEHOLDER]     FUEGO LEADZ LLC         │
│                         5728 Major Blvd Ste 702  │
│                         Orlando, FL 32819        │
│                         [email]                  │
├─────────────────────────────────────────────────┤
│  INVOICE                                        │
│  Invoice #: INV-2026-0419-SMIT-001              │
│  Date: April 19, 2026                           │
│  Due: Upon Receipt                              │
├─────────────────────────────────────────────────┤
│  BILL TO:                                       │
│  John Smith                                     │
│  john@email.com | (555) 123-4567               │
├─────────────────────────────────────────────────┤
│  Lead Type        Qty  Guar. Min  Unit $  Total │
│  ─────────────────────────────────────────────  │
│  Trucker IUL       50     30      $X.XX   $XXX  │
│  Spanish IUL       25      —      $X.XX   $XXX  │
├─────────────────────────────────────────────────┤
│                              TOTAL:    $XXX.XX  │
├─────────────────────────────────────────────────┤
│  PAYMENT METHODS                                │
│  Zelle:        [PLACEHOLDER]                    │
│  Bank Transfer: [PLACEHOLDER]                   │
│  PayPal:       [PLACEHOLDER]                    │
│  Other:        [PLACEHOLDER]                    │
├─────────────────────────────────────────────────┤
│  Thank you for your business!                   │
└─────────────────────────────────────────────────┘
```

Guaranteed minimum column only renders if at least one line item has a value entered.

---

## Email
- Sent via Nodemailer using Fuego Leadz Gmail + App Password
- Subject: `Invoice INV-XXXX from Fuego Leadz LLC`
- Body: short professional message with invoice attached as PDF
- SMTP credentials stored in local app settings (encrypted via Electron safeStorage)

---

## Local Data (SQLite Schema)

**clients** — id, first_name, last_name, email, phone, created_at

**invoices** — id, client_id, invoice_number, invoice_date, total_amount, pdf_path, emailed, created_at

**invoice_line_items** — id, invoice_id, lead_type, quantity, unit_price, guaranteed_minimum

**settings** — key, value (stores: save_folder, smtp_user, smtp_pass_encrypted, smtp_host, smtp_port)

---

## Pending / Future
- Add Fuego Leadz logo to invoice header when available
- Fill in payment method details (Zelle number, bank info, PayPal link)
- Recurring invoice reminders / auto-send on schedule
