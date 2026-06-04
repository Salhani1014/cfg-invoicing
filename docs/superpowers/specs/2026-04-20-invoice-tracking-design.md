# Invoice Tracking & Paid Status — Design Spec
**Date:** 2026-04-20  
**Project:** CFG Invoicing (Electron)

---

## Overview

Add a dedicated Invoices screen to track all sent invoices, mark them as paid (which sends a PAID receipt PDF to the client), resend invoices, and delete records. Also fixes the invoice ID format, company address, and adds "All sales are final" to the invoice template.

---

## 1. Database Changes

### Migration (added to `migrate()` in `src/db.js`)
```sql
ALTER TABLE invoices ADD COLUMN paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN paid_at TEXT;
```

SQLite `ALTER TABLE ADD COLUMN` is safe on existing data — existing rows get the default value. No data loss.

### Invoice ID format change
- Current: `INV-YYYY-MMDD-LAST4FIRST-SEQ3` where SEQ3 = `001`, `002`, ...
- New: `INV-YYYY-MMDD-LAST4FIRST-XXXXXX` where XXXXXX = random 6-digit integer (`100000`–`999999`)
- Change in `src/invoice-number.js` — replace `getNextInvoiceSeq()` call with `Math.floor(100000 + Math.random() * 900000)`

### New DB queries in `src/db.js`
- `getAllInvoices()` — already exists, extend to include `paid`, `paid_at`
- `markInvoicePaid(id)` — sets `paid=1`, `paid_at=datetime('now')`
- `deleteInvoice(id)` — deletes invoice and its line items (cascade transaction)

---

## 2. Invoices Screen (`renderer/screens/invoices.js`)

### Navigation
- New sidebar entry between Batch Invoice and Analytics
- Nav label: **Invoices**
- Badge on nav item showing count of unpaid invoices (updates on load)

### Layout
- **Summary bar** at top: total unpaid amount outstanding across all invoices
- **Filter tabs**: All | Unpaid | Paid (default: All)
- **Search input**: filters by client name or invoice number live
- **Table columns**: Invoice # | Client | Lead Types | Date | Amount | Status | Actions

### Table rows
| State | Actions |
|-------|---------|
| Unpaid | Mark Paid · Send Again · Delete |
| Paid | Resend Receipt · Delete |

- **Mark Paid**: triggers paid flow (see §3)
- **Send Again**: resends original invoice email (no status change)
- **Resend Receipt**: resends paid receipt email
- **Delete**: confirmation prompt → deletes invoice + line items from DB

### Status badges
- Unpaid: red badge (matches existing `badge-red` class)
- Paid: green badge with paid date shown below (`badge-green`)

---

## 3. Mark Paid Flow

Triggered by clicking "Mark Paid" on an unpaid invoice row.

1. Mark invoice as paid in DB (`markInvoicePaid(id)`)
2. Retrieve full invoice data (client, line items, settings, original pdf path)
3. Regenerate PDF with `paid: true` flag passed to `generateInvoicePDF()`
   - Save as `{invoiceNumber}-paid.pdf` alongside the original in the client's save folder
4. Send confirmation email via nodemailer with PAID PDF attached
5. Refresh the invoices table row to show Paid status

### Paid PDF differences from original
- Due box: `PAID ✓` in green instead of `Due upon Receipt`
- Footer note: `Payment received — thank you!`

### Paid confirmation email
- **Subject**: `Payment Received — Invoice {invoiceNumber}`
- **Body**: "Hi {firstName}, we've received your payment for Invoice #{invoiceNumber}. Please find your receipt attached. Thank you for your business!"
- **Attachment**: `{invoiceNumber}-paid.pdf`

---

## 4. Invoice Template Updates (`renderer/invoice-template/template.html`)

### Address
`5728 Major Blvd STE 702, Orlando FL 32819`  
(replaces current Winter Garden address)

### "All sales are final"
Added to the footer alongside the company footer note:
```
All sales are final.  ·  Checkmate Financial Group LLC · Florida LLC · L26000014292
```

### PAID state in due box
Template receives `data.paid` boolean:
- `paid: false` → black box, "Due upon Receipt" in gold (current behavior)
- `paid: true` → green box, "PAID ✓" in white

---

## 5. New IPC Handlers (`main.js`)

```javascript
ipcMain.handle('db:markInvoicePaid', (_, id) => db.markInvoicePaid(id));
ipcMain.handle('db:deleteInvoice', (_, id) => db.deleteInvoice(id));
ipcMain.handle('pdf:generatePaid', async (_, data) => { /* regenerate with paid flag, return pdfPath */ });
ipcMain.handle('mail:sendPaidReceipt', async (_, data) => { /* send email with paid PDF attached */ });
ipcMain.handle('mail:sendInvoiceAgain', async (_, data) => { /* resend original invoice email using existing pdf_path, no new DB record */ });
```

---

## 6. Preload Updates (`preload.js`)

Expose new handlers under existing namespaces:
```javascript
db.markInvoicePaid, db.deleteInvoice
pdf.generatePaid
mail.sendPaidReceipt, mail.sendInvoiceAgain
```

---

## 7. Mailer Updates (`src/mailer.js`)

New function `sendPaidReceipt({ client, invoiceNumber, pdfPath, settings })`:
- Uses existing Gmail SMTP config
- Attaches the PAID PDF
- Subject/body as defined in §3

Existing `sendInvoiceEmail` reused for "Send Again" — already handles attachment.

---

## 8. Files Changed

| File | Change |
|------|--------|
| `src/db.js` | Migration for `paid`/`paid_at`, new queries |
| `src/invoice-number.js` | Random 6-digit ID |
| `src/mailer.js` | `sendPaidReceipt()` function |
| `src/pdf-generator.js` | Accept `paid` flag, pass to template |
| `renderer/invoice-template/template.html` | Address, footer, PAID due box |
| `renderer/screens/invoices.js` | New file — full invoices screen |
| `renderer/screens/settings.js` | No change |
| `renderer/app.js` | Register `invoices` screen |
| `renderer/index.html` | Add Invoices nav item with badge |
| `main.js` | New IPC handlers |
| `preload.js` | Expose new handlers |

---

## Out of Scope

- Exporting invoices to CSV (future)
- Recurring invoices (future)
- DocuSign / e-signature (future)
