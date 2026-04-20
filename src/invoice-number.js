function generateInvoiceNumber(lastName, firstName, date, seq) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let last = clean(lastName).slice(0, 4);
  last = last.padEnd(4, '0');
  const first = clean(firstName).slice(0, 1) || '0';
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const seqPart = String(seq).padStart(3, '0');
  return `INV-${datePart.slice(0, 4)}-${datePart.slice(4, 8)}-${last}${first}-${seqPart}`;
}

module.exports = { generateInvoiceNumber };
