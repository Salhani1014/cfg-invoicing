function generateInvoiceNumber(lastName, firstName, date) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let last = clean(lastName).slice(0, 4).padEnd(4, '0');
  const first = clean(firstName).slice(0, 1) || '0';
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `INV-${datePart.slice(0, 4)}-${datePart.slice(4, 8)}-${last}${first}-${rand}`;
}

function generatePayStubNumber(legalName, date) {
  const clean = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const firstWord = clean(legalName.split(' ')[0]);
  const code = firstWord.slice(0, 4).padEnd(4, '0');
  const datePart = date.replace(/-/g, '').slice(0, 8);
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `PS-${datePart.slice(0, 4)}-${datePart.slice(4, 8)}-${code}-${rand}`;
}

module.exports = { generateInvoiceNumber, generatePayStubNumber };
