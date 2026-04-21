# Contractor / 1099 Module — Design Spec
**Date:** 2026-04-20
**Project:** CFG Invoicing (Electron)

---

## Overview

Add a dedicated **Contractors** tab to the app for tracking independent contractor payments. CFG initiates all payments (via Zelle); contractors do not send invoices. Each payment generates a professional corporate-style pay stub PDF that can be emailed. Year-end export (CSV + summary PDF) gives the accountant everything needed to prepare 1099-NEC forms.

---

## 1. Data Model

Two new Supabase tables. Schema changes are applied directly in the Supabase dashboard before the app ships.

### `contractors`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key, default gen_random_uuid() |
| `legal_name` | text | as it appears on W-9, NOT NULL |
| `email` | text | for pay stub delivery, NOT NULL |
| `phone` | text | optional |
| `address` | text | street address, NOT NULL |
| `city` | text | NOT NULL |
| `state` | text | 2-letter, NOT NULL |
| `zip` | text | NOT NULL |
| `tax_id` | text | SSN (XXX-XX-XXXX) or EIN (XX-XXXXXXX), NOT NULL |
| `tax_classification` | text | 'Individual/Sole Proprietor', 'LLC', 'S-Corp', 'C-Corp', 'Partnership' |
| `w9_on_file` | boolean | default false |
| `notes` | text | optional |
| `created_at` | timestamptz | default now() |

### `contractor_payments`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | primary key, default gen_random_uuid() |
| `contractor_id` | uuid | FK → contractors.id NOT NULL |
| `pay_date` | date | when Zelle was sent, NOT NULL |
| `pay_period_start` | date | optional |
| `pay_period_end` | date | optional |
| `hours` | numeric(10,2) | NOT NULL |
| `hourly_rate` | numeric(10,2) | NOT NULL |
| `total_amount` | numeric(10,2) | stored (hours × rate), NOT NULL |
| `description` | text | always-visible notes field, NOT NULL |
| `payment_method` | text | default 'paymentZelle' |
| `recurring` | boolean | default false |
| `pdf_path` | text | nullable |
| `emailed` | boolean | default false |
| `created_by` | text | 'braxton' or 'obada' |
| `created_at` | timestamptz | default now() |

**1099-NEC threshold:** Any contractor with `SUM(total_amount) >= 600` for a calendar year requires a 1099-NEC filing. The app flags this automatically in the export.

---

## 2. Navigation

Add `'contractors'` as a top-level nav item in `renderer/app.js` between Invoices and Batch Invoice:

```
Clients · Invoices · Contractors · Batch · Dashboard · Settings
```

Add to `screenLoaders`:
```javascript
contractors: () => import('./screens/contractors.js').then(m => m.contractorsScreen),
```

Add nav link to the HTML nav bar in `renderer/index.html`.

---

## 3. Contractors Screen (`renderer/screens/contractors.js`)

Single screen covering the full contractor workflow. No sub-routes.

### 3a. Contractor Directory (default view)

- Page header: "Contractors" + "+ Add Contractor" button (top right)
- One card per contractor showing:
  - **Legal name** + email
  - **W-9 badge:** gold "W-9 ✓" if `w9_on_file`, muted "W-9 pending" if not
  - **YTD total** for the current calendar year
  - **⚠ indicator** if YTD ≥ $600 (1099-NEC required)
  - **"Log Payment"** button — expands the payment form inline below the card
  - **"View History"** button — expands the payment history table inline
  - **"Edit"** button — expands the edit contractor form inline

### 3b. Add / Edit Contractor Form

Fields (all required unless noted):
- Legal Name
- Email
- Phone (optional)
- Address, City, State, ZIP
- Tax ID (SSN or EIN)
- Tax Classification (select: Individual/Sole Proprietor, LLC, S-Corp, C-Corp, Partnership)
- W-9 on File (checkbox)
- Notes (optional)

Save calls `window.api.db.addContractor(data)` or `window.api.db.updateContractor(id, data)`.

### 3c. Log Payment Form (expands inline below contractor card)

Fields:
- **Pay Date** (date input, defaults to today)
- **Payment Method** (select, defaults to Zelle)
- **Hours Worked** (number, e.g. 8.5)
- **Hourly Rate ($)** (number, e.g. 25.00)
- **Total** — auto-calculated display (hours × rate), read-only, updates live
- **Pay Period Start / End** (two date inputs, optional)
- **Description** (textarea, always visible — required)
- **Recurring** (checkbox, default unchecked)

Buttons:
- **"Generate & Send Pay Stub"** — generates PDF, emails to contractor, marks emailed
- **"Generate Only"** — generates PDF, does not email

On submit: calls `window.api.pdf.generatePayStub(data)`, which creates the payment record, generates the PDF, optionally emails it.

### 3d. Payment History (expands inline below contractor card)

Table columns: Date · Description · Hours · Rate · Total · Actions

Actions per row:
- **Edit** — pre-fills the Log Payment form with this payment's data
- **↓** — re-downloads the pay stub PDF via `window.api.shell.openPath`

YTD total row at bottom of table.

---

## 4. Pay Stub PDF

### Template: `renderer/pay-stub-template/template.html`

Corporate white format (not the app's dark/gold theme). Sections:

1. **Header bar** — navy blue (`#1a3a5c`), white text: company name + address left, "PAY STUB" + stub number right
2. **Info row** — three columns: Pay Date · Pay Period · Payment Method
3. **Parties** — two columns: Contractor (legal name, address, masked Tax ID `***-**-XXXX`, classification) + Employer (CFG name, address, email)
4. **Earnings table** — columns: Description · Hours · Rate · Amount
5. **Totals row** — YTD Total Paid (left) + Net Pay in navy (right)
6. **Notes** — description field, always shown
7. **Footer** — "This document is for record-keeping purposes only and does not constitute a tax form."

**Pay stub number format:** `PS-YYYY-MMDD-[FIRST4LAST]-[SEQ3]`
Example: `PS-2026-0420-SANT-001` (sequence resets per contractor per year)

**Tax ID masking:** Show only last 4 digits: `***-**-6789` or `**-***4321`

**PDF saved to:** `{saveFolder}/{ContractorName}/PS-YYYY-MMDD-XXXX-NNN.pdf`

### Generator: new function `generatePayStub(data)` in `src/pdf-generator.js`

Input data shape:
```javascript
{
  contractor: { id, legal_name, email, phone, address, city, state, zip, tax_id, tax_classification },
  payment: { id, pay_date, pay_period_start, pay_period_end, hours, hourly_rate, total_amount, description, payment_method },
  ytdTotal: number,       // sum of all payments for this contractor in current year
  stubNumber: string,     // PS-YYYY-MMDD-XXXX-NNN
  saveFolder: string,
  settings: { companyEmail, paymentZelle, ... }
}
```

Reuses the existing `renderToPDF(windowData)` helper already in `pdf-generator.js`.

---

## 5. Pay Stub Email (`src/mailer.js`)

New export: `sendPayStub({ contractor, stubNumber, pdfPath, settings })`

Subject: `Pay Stub — {stubNumber}`
Body: brief message confirming the payment, attaches PDF.

Follows the same Nodemailer pattern as `sendInvoiceEmail`.

---

## 6. Export

Accessible from a dedicated **"Export"** section at the top of the Contractors screen (above the contractor list), collapsed by default, expanded via an "Export Payments" button.

### Parameters

- **Year** — select (current year default, lists all years that have payments)
- **Contractor** — select (All Contractors default, or specific contractor)
- **Date Range** — optional start/end date inputs

### CSV Export

Button: **"Export CSV"**

Calls `window.api.contractors.exportCsv(params)` → IPC handler writes file to `{saveFolder}/contractor-payments-{year}.csv` and opens it with `shell.openPath`.

CSV columns:
```
Pay Date, Contractor, Tax ID, Classification, Description, Hours, Rate, Total, Payment Method, YTD Total, 1099 Required
```

One row per payment (not one row per contractor). Accountant can pivot as needed.

### Year-End Summary PDF

Button: **"Year-End Summary PDF"**

White background, all black text, simple table — not styled as an official tax form.

Sections:
1. Title: "Contractor Payment Summary — {Year}"
2. Company name + generated date
3. Disclaimer: "This is an internal record-keeping document, not an official tax form."
4. Summary table — one row per contractor: Legal Name · Tax ID (masked) · Classification · Total Paid · ≥$600?
5. Grand total row
6. Footer: "Consult your accountant for 1099-NEC filing requirements. Florida has no state income tax."

Saved to `{saveFolder}/contractor-summary-{year}.pdf`, opened with `shell.openPath`.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `renderer/index.html` | Add Contractors nav link |
| `renderer/app.js` | Add `contractors` to `screenLoaders` |
| `renderer/screens/contractors.js` | New: full contractors screen |
| `renderer/pay-stub-template/template.html` | New: corporate white pay stub template |
| `src/pdf-generator.js` | Add `generatePayStub(data)` + `generateYearEndSummaryPDF(data)` |
| `src/db.js` | Add contractor + contractor_payment CRUD functions |
| `src/mailer.js` | Add `sendPayStub(data)` |
| `main.js` | Add IPC handlers for contractors, pay stub PDF, export |
| `preload.js` | Expose `window.api.db` contractor functions, `window.api.contractors.exportCsv`, `window.api.pdf.generatePayStub` |

**Supabase:** Create `contractors` and `contractor_payments` tables manually in the Supabase dashboard before deploying.

---

## 8. IPC Channels Added

| Channel | Handler |
|---------|---------|
| `db:getContractors` | Returns all contractors + current-year YTD total |
| `db:addContractor` | Inserts new contractor |
| `db:updateContractor` | Updates contractor fields |
| `db:deleteContractor` | Deletes contractor — blocked if any payments exist (shows error toast) |
| `db:getContractorPayments` | Returns all payments for a contractor |
| `db:addContractorPayment` | Inserts payment, returns id |
| `db:updateContractorPayment` | Updates payment fields |
| `db:deleteContractorPayment` | Deletes a payment |
| `db:getNextPayStubSeq` | Returns next stub sequence number for contractor+year |
| `pdf:generatePayStub` | Generates pay stub PDF, optionally emails |
| `contractors:exportCsv` | Writes CSV to saveFolder, returns path |
| `contractors:exportSummaryPdf` | Generates year-end summary PDF, returns path |

---

## 9. Out of Scope

- Automatic recurring payment scheduling / reminders
- W-9 file upload / storage
- Multi-year comparison analytics
- Bulk pay stub generation
- Official IRS-format 1099-NEC form generation
