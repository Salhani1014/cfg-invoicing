# Batch Invoice Custom Type — Design Spec
**Date:** 2026-04-20
**Project:** CFG Invoicing (Electron)

---

## Overview

Add a global "Lead / Custom" mode toggle to the existing batch invoice screen (`renderer/screens/bulk-invoice.js`). When switched to Custom mode, every expanded client card shows free-form line items (description + amount) instead of the predefined lead type checkboxes. The PDF pipeline, progress display, generate/send buttons, and client list are unchanged.

Also fixes a bug introduced during the Supabase migration: `saveFolder` is read from `window.api.settings.get('saveFolder')` but that key was moved to local user config. Fix: read from `window.api.userConfig.getConfig()` instead.

---

## 1. Mode Toggle

A segmented control rendered above the client list:

```
[ Lead Invoices ]  [ Custom Invoices ]
```

- Default: **Lead Invoices** (existing behavior)
- Switching mode re-renders all expanded client cards to show the correct input UI
- Collapsed (unchecked) client rows are unaffected — they stay collapsed
- The selected mode applies to the entire batch; a single batch is all-lead or all-custom

---

## 2. Custom Mode — Per-Client Fields

When a client row is expanded in Custom mode, instead of lead type checkboxes, it shows:

- One or more **line item rows**: `[Description input] [$Amount input] [× remove]`
- An **"+ Add Line"** button to add more rows (minimum 1 row, always present)
- The first row cannot be removed (remove button disabled when only one row remains)
- Same **Payment Method** dropdown as Lead mode

Line item data shape (same as single invoice custom mode):
```javascript
{ leadType: descriptionText, quantity: 1, unitPrice: amount, guaranteedMinimum: null }
```

`leadType` stores the description text — consistent with how `create-invoice.js` handles custom line items.

---

## 3. Validation

In Custom mode, `getCheckedInvoices()` validates:
- Each checked client has at least one line item
- Every line item has both a non-empty description and a non-zero amount
- Error toasts match existing batch invoice error style

---

## 4. Invoice Generation

Custom mode calls `window.api.pdf.generate()` with `invoiceType: 'custom'` added to the payload. The existing PDF template already switches the column header to "Description" when `invoiceType === 'custom'`. No changes to `pdf-generator.js`, `db.js`, or `main.js`.

---

## 5. saveFolder Bug Fix

**Current (broken):**
```javascript
const saveFolder = await window.api.settings.get('saveFolder');
```

**Fixed:**
```javascript
const userCfg = await window.api.userConfig.getConfig();
const saveFolder = userCfg?.saveFolder;
```

Error message if missing: `'Save folder not configured. Go to Settings to set it up.'`

---

## 6. Files Changed

| File | Change |
|------|--------|
| `renderer/screens/bulk-invoice.js` | Add mode toggle, custom line item UI, custom validation, `invoiceType: 'custom'` in payload, fix `saveFolder` source |

No other files change. The custom invoice type already exists end-to-end in the PDF pipeline.
