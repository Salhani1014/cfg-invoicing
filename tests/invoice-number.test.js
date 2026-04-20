const { generateInvoiceNumber } = require('../src/invoice-number');

test('generates correct format with last name + first initial', () => {
  const num = generateInvoiceNumber('Smith', 'John', '2026-04-19', 1);
  expect(num).toBe('INV-2026-0419-SMITJ-001');
});

test('pads sequence to 3 digits', () => {
  expect(generateInvoiceNumber('Doe', 'Jane', '2026-04-19', 12)).toBe('INV-2026-0419-DOE0J-012');
});

test('handles last name shorter than 4 chars', () => {
  expect(generateInvoiceNumber('Li', 'Bob', '2026-04-19', 1)).toBe('INV-2026-0419-LI00B-001');
});

test('strips special characters', () => {
  expect(generateInvoiceNumber("O'Brien", 'Mike', '2026-04-19', 1)).toBe('INV-2026-0419-OBRIM-001');
});

test('handles single-character last name', () => {
  expect(generateInvoiceNumber('A', 'Bob', '2026-04-19', 1)).toBe('INV-2026-0419-A000B-001');
});
