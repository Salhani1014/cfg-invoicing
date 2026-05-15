const { weekBounds } = require('../src/db-time-tracking');

test('weekBounds returns Sun..Sun (exclusive) for mid-week', () => {
  const w = weekBounds('2026-05-14'); // Thursday
  expect(w.startIso).toBe('2026-05-10T00:00:00.000Z');
  expect(w.endIso).toBe('2026-05-17T00:00:00.000Z');
});

test('weekBounds for Sunday itself: start === input day', () => {
  const w = weekBounds('2026-05-10'); // Sunday
  expect(w.startIso).toBe('2026-05-10T00:00:00.000Z');
  expect(w.endIso).toBe('2026-05-17T00:00:00.000Z');
});

test('weekBounds for Saturday: 6 days back', () => {
  const w = weekBounds('2026-05-16'); // Saturday
  expect(w.startIso).toBe('2026-05-10T00:00:00.000Z');
  expect(w.endIso).toBe('2026-05-17T00:00:00.000Z');
});
