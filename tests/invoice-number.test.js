const { generateInvoiceNumber } = require('../src/invoice-number');

const FORMAT = /^INV-\d{4}-\d{4}-[A-Z0-9]{4}[A-Z0-9]-\d{6}$/;

test('generates correct format', () => {
  const num = generateInvoiceNumber('Smith', 'John', '2026-04-19');
  expect(num).toMatch(FORMAT);
});

test('encodes last name (up to 4 chars) and first initial', () => {
  const num = generateInvoiceNumber('Smith', 'John', '2026-04-19');
  expect(num).toContain('SMITJ');
});

test('handles last name shorter than 4 chars with padding', () => {
  const num = generateInvoiceNumber('Li', 'Bob', '2026-04-19');
  expect(num).toContain('LI00B');
});

test('strips special characters from name', () => {
  const num = generateInvoiceNumber("O'Brien", 'Mike', '2026-04-19');
  expect(num).toContain('OBRIM');
});

test('handles single-character last name', () => {
  const num = generateInvoiceNumber('A', 'Bob', '2026-04-19');
  expect(num).toContain('A000B');
});

test('random suffix is 6 digits between 100000 and 999999', () => {
  const num = generateInvoiceNumber('Smith', 'John', '2026-04-19');
  const rand = Number(num.split('-').pop());
  expect(rand).toBeGreaterThanOrEqual(100000);
  expect(rand).toBeLessThanOrEqual(999999);
});

test('generates unique numbers on repeated calls', () => {
  const nums = new Set(
    Array.from({ length: 20 }, () => generateInvoiceNumber('Smith', 'John', '2026-04-19'))
  );
  expect(nums.size).toBeGreaterThan(1);
});

// Pay Stub Number tests
const { generatePayStubNumber } = require('../src/invoice-number');

const PS_FORMAT = /^PS-\d{4}-\d{4}-[A-Z0-9]{4}-\d{6}$/;

test('generatePayStubNumber generates correct format', () => {
  const num = generatePayStubNumber('Maria Santos', '2026-04-20');
  expect(num).toMatch(PS_FORMAT);
});

test('generatePayStubNumber uses first 4 chars of cleaned first word', () => {
  const num = generatePayStubNumber('Santos Maria', '2026-04-20');
  expect(num).toContain('SANT');
});

test('generatePayStubNumber pads short names', () => {
  const num = generatePayStubNumber('Li Bo', '2026-04-20');
  expect(num).toContain('LI00');
});

test('generatePayStubNumber strips special characters', () => {
  const num = generatePayStubNumber("O'Brien LLC", '2026-04-20');
  expect(num).toContain('OBRI');
});

test('generatePayStubNumber random suffix is 6 digits', () => {
  const num = generatePayStubNumber('Maria Santos', '2026-04-20');
  const rand = Number(num.split('-').pop());
  expect(rand).toBeGreaterThanOrEqual(100000);
  expect(rand).toBeLessThanOrEqual(999999);
});

test('generatePayStubNumber generates unique numbers', () => {
  const nums = new Set(
    Array.from({ length: 20 }, () => generatePayStubNumber('Maria Santos', '2026-04-20'))
  );
  expect(nums.size).toBeGreaterThan(1);
});
