# Custom Invoice Types + Inline Notes — Design Spec
**Date:** 2026-04-20
**Project:** CFG Invoicing (Electron)

---

## Overview

Two changes to the existing invoice system:

1. **Invoice type selector** — the Create Invoice screen gains a type dropdown. "Lead Invoice" keeps the existing checkbox UI. "Custom Invoice" replaces it with free-form line items (description + amount). The type is stored on the invoice record and used for filtering and PDF rendering.

2. **Inline notes** — on the Invoices screen, if an invoice has a note, a second table row appears immediately below it showing the note text with a gold left border. No click required.

---

## 1. Data Model

### Migration (`src/db.js`)

```sql
ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'lead';
```

Safe on existing data — all current invoices get `'lead'` automatically.

Valid values: `'lead'` | `'custom'`. No other tables change. Custom line items reuse `invoice_line_items` with `lead_type` holding the user-typed description.

### `createInvoice` update

Add `invoice_type` to the INSERT:

```javascript
INSERT INTO invoices (client_id, invoice_number, invoice_date, total_amount, payment_method, invoice_type)
VALUES (?, ?, ?, ?, ?, ?)
```

`data.invoiceType` defaults to `'lead'` if not provided.

### `getAllInvoices` update

Add `i.invoice_type` to the SELECT so the invoices screen can filter by type.

---

## 2. Create Invoice Screen (`renderer/screens/create-invoice.js`)

### Type selector

A dropdown inserted between the client/date card and the lead types card:

```
Invoice Type: [ Lead Invoice ▾ ]
              [ Custom Invoice  ]
```

Changing the selection swaps the content of the line items section below. Payment method card is unchanged for both types.

### Lead Invoice mode (existing behavior)

No changes. Checkboxes for Trucker IUL Leads, Spanish IUL Leads, Widow of Veteran Leads with Amount + Guaranteed Min fields per type.

### Custom Invoice mode

Replaces the checkbox section with a dynamic list of line items. Each row:

- **Description** — text input, required, placeholder "e.g. Consulting fee, Setup fee…"
- **Amount ($)** — number input, required
- **×** — remove button (disabled when only one row remains)

An **"+ Add Line Item"** button appends a new blank row. Starts with one blank row. No maximum.

`getLineItems()` in custom mode returns:

```javascript
{ leadType: descriptionValue, quantity: 1, unitPrice: amountValue, guaranteedMinimum: null }
```

This reuses the existing line item schema exactly — `leadType` stores the description text. No schema change required.

### Auto-populate from last invoice

When a client is selected and their last invoice was a custom invoice, `populateFromLastInvoice()` switches the type selector to "Custom Invoice" and fills in their previous line items (description + amount). If their last invoice was a lead invoice, existing behavior applies.

### Passing type to PDF generator

`generate()` passes `invoiceType: 'custom'` or `'lead'` alongside existing fields. `pdf-generator.js` forwards it to the template and to `db.createInvoice`.

---

## 3. PDF Template (`renderer/invoice-template/template.html`)

The template already renders `data.lineItems` dynamically. One conditional change:

```javascript
const lineItemHeader = data.invoiceType === 'custom' ? 'Description' : 'Lead Type';
```

The `<th>` for the first column uses `lineItemHeader`. All other template sections (due-box, payment method, footer, PAID state, logo) are unchanged.

---

## 4. Invoices Screen (`renderer/screens/invoices.js`)

### Inline notes display

`renderRow(inv)` now returns one or two `<tr>` elements concatenated:

```javascript
function renderRow(inv) {
  const mainRow = `<tr>...</tr>`;
  const noteRow = (inv.notes && inv.notes.trim())
    ? `<tr>
         <td colspan="8" style="padding:0 20px 10px 52px">
           <div style="border-left:2px solid var(--gold);padding:6px 12px;background:rgba(201,168,76,0.05);
                       font-size:12px;color:var(--text-muted);font-style:italic">
             ${esc(inv.notes)}
           </div>
         </td>
       </tr>`
    : '';
  return mainRow + noteRow;
}
```

The note row indents to align with the invoice content (past the checkbox column). The 📝 icon remains in the actions column for editing.

### Invoice type filter

The lead type filter dropdown gains a new option:

```html
<option value="__custom__">Custom Invoices</option>
```

When selected, filters to invoices where `inv.invoice_type === 'custom'`. The existing lead type options filter within lead invoices only.

---

## 5. Files Changed

| File | Change |
|------|--------|
| `src/db.js` | Migration for `invoice_type`; update `createInvoice` INSERT (`i.*` in existing queries picks up the new column automatically) |
| `src/pdf-generator.js` | Pass `invoiceType` to `createInvoice` and to template payload |
| `renderer/screens/create-invoice.js` | Type selector dropdown; custom line items UI; auto-populate handles custom type |
| `renderer/invoice-template/template.html` | Conditional column header (Lead Type vs Description) |
| `renderer/screens/invoices.js` | Inline note row below invoice; custom type filter option |

`main.js` and `preload.js` require no changes — existing `pdf:generate` IPC handler passes the full data object through.

---

## Out of Scope

- Contractor / 1099 invoice type (Sub-project 2)
- Invoice type analytics breakdown (deferred to Sub-project 4)
- Editing invoice type after creation
