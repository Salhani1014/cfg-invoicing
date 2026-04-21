#!/usr/bin/env node
// One-time migration: local SQLite → Supabase
// Run from project root: node scripts/migrate-to-supabase.js

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require('../src/supabase');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const dbPath = path.join(
  os.homedir(), 'Library', 'Application Support', 'CFG Invoicing', 'fuego-leadz.db'
);

const SKIP_SETTINGS = new Set(['smtpUser', 'smtpPass', 'saveFolder']);

async function migrate() {
  console.log('Reading SQLite from:', dbPath);
  const sqlite = new Database(dbPath, { readonly: true });

  // 1. Clients
  const clients = sqlite.prepare('SELECT * FROM clients').all();
  console.log(`\nMigrating ${clients.length} clients...`);
  for (const c of clients) {
    const { error } = await supabase.from('clients').upsert({
      id: c.id, first_name: c.first_name, last_name: c.last_name,
      email: c.email, phone: c.phone, created_at: c.created_at
    }, { onConflict: 'id' });
    if (error) console.error(`  Client ${c.id} (${c.last_name}):`, error.message);
    else process.stdout.write('.');
  }

  // 2. Invoices
  const invoices = sqlite.prepare('SELECT * FROM invoices').all();
  console.log(`\nMigrating ${invoices.length} invoices...`);
  for (const inv of invoices) {
    const { error } = await supabase.from('invoices').upsert({
      id: inv.id, client_id: inv.client_id,
      invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
      total_amount: inv.total_amount, pdf_path: inv.pdf_path || null,
      emailed: !!inv.emailed, paid: !!inv.paid, paid_at: inv.paid_at || null,
      payment_method: inv.payment_method || null,
      reminder_sent_at: inv.reminder_sent_at || null,
      notes: inv.notes || null,
      invoice_type: inv.invoice_type || 'lead',
      created_by: 'braxton',
      created_at: inv.created_at
    }, { onConflict: 'id' });
    if (error) console.error(`  Invoice ${inv.id} (${inv.invoice_number}):`, error.message);
    else process.stdout.write('.');
  }

  // 3. Line items
  const items = sqlite.prepare('SELECT * FROM invoice_line_items').all();
  console.log(`\nMigrating ${items.length} line items...`);
  for (const li of items) {
    const { error } = await supabase.from('invoice_line_items').upsert({
      id: li.id, invoice_id: li.invoice_id,
      lead_type: li.lead_type, quantity: li.quantity,
      unit_price: li.unit_price, guaranteed_minimum: li.guaranteed_minimum || null
    }, { onConflict: 'id' });
    if (error) console.error(`  Line item ${li.id}:`, error.message);
    else process.stdout.write('.');
  }

  // 4. Global settings only
  const settings = sqlite.prepare('SELECT * FROM settings').all()
    .filter(r => !SKIP_SETTINGS.has(r.key));
  console.log(`\nMigrating ${settings.length} global settings...`);
  for (const s of settings) {
    const { error } = await supabase.from('settings')
      .upsert({ key: s.key, value: s.value }, { onConflict: 'key' });
    if (error) console.error(`  Setting ${s.key}:`, error.message);
  }

  // Ensure schemaVersion is set
  await supabase.from('settings')
    .upsert({ key: 'schemaVersion', value: '1' }, { onConflict: 'key' });

  sqlite.close();
  console.log('\n\nMigration complete!');
  console.log('Your local SQLite file is preserved at:', dbPath);
  console.log('The app will now use Supabase for all data.');
}

migrate().catch(e => { console.error('\nMigration failed:', e.message); process.exit(1); });
