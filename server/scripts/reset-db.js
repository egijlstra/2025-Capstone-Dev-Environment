// scripts/reset-db.js
// Script to reset the database to original seven orders + matching authorizations
// Run with: node scripts/reset-db.js

import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB path consistent with your app
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../database/database.db');

// Keep constants in sync with app
const ORDER_STATUS = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  SETTLED: 'SETTLED',
  ERROR: 'ERROR',
};
const AUTH_OUTCOME = {
  SUCCESS: 'SUCCESS',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INCORRECT_DETAILS: 'INCORRECT_DETAILS',
  SERVER_ERROR: 'SERVER_ERROR',
};
const STATIC_TOKEN_PREFIX = 'STATIC_TOKEN_';

// ---- Original 7 orders (from original DB snapshot) ----
// order_id, status, customer_name, card_last4, amount, created_at
const ORIGINAL_SEVEN = [
  ['ORD-1001', 'AUTHORIZED', 'Erik Gijlstra', '4242', 12.99, '2025-10-01T10:00Z'],
  ['ORD-1002', 'ERROR',      'Prisca Louis',  '1881', 50.00, '2025-10-01T10:05Z'],
  ['ORD-1003', 'AUTHORIZED', 'Felix Botero',  '1111', 45.00, '2025-10-01T10:10Z'],
  ['ORD-1004', 'ERROR',      'Mariah Weldon', '0005', 25.99, '2025-10-01T10:15Z'],
  ['ORD-1005', 'AUTHORIZED', 'Test 1',        '0129', 50.00, '2025-10-02 21:18:40'],
  ['ORD-1006', 'AUTHORIZED', 'Test 2',        '2011', 50.00, '2025-10-02 21:19:17'],
  ['ORD-1007', 'AUTHORIZED', 'Test 3',        '2019', 49.97, '2025-10-02 21:19:38'],
];

// ---------- helpers ----------
function ensureDbDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}
function openDb(p) {
  const db = new Database(p);
  db.pragma('journal_mode = WAL');
  return db;
}
function migrate(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      status   TEXT NOT NULL,
      customer_name TEXT,
      card_last4 TEXT,
      amount   REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      provider_token TEXT,
      amount REAL NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      amount REAL NOT NULL,
      outcome TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS sequences (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )
  `).run();
}
function setSequence(db, value) {
  db.prepare(`
    INSERT INTO sequences (name, value) VALUES ('ORDER', ?)
    ON CONFLICT(name) DO UPDATE SET value=excluded.value
  `).run(value);
}
function toMoney(n) {
  return Number(Number(n).toFixed(2));
}

function resetToOriginalSeven() {
  ensureDbDir(DB_PATH);
  const db = openDb(DB_PATH);
  try {
    migrate(db);

    const insertOrder = db.prepare(`
      INSERT INTO orders (order_id, status, customer_name, card_last4, amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertAuth = db.prepare(`
      INSERT INTO authorizations (order_id, provider_token, amount, outcome, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
      // wipe all data
      db.prepare(`DELETE FROM settlements`).run();
      db.prepare(`DELETE FROM authorizations`).run();
      db.prepare(`DELETE FROM orders`).run();

      // seed 7 orders + matching auth outcome
      for (const [order_id, status, customer_name, card_last4, amount, created_at] of ORIGINAL_SEVEN) {
        insertOrder.run(order_id, status, customer_name, String(card_last4 ?? ''), toMoney(amount), created_at);

        // Create one authorization row that matches the order status
        const provider_token = `${STATIC_TOKEN_PREFIX}${order_id}`;
        const outcome =
          status === ORDER_STATUS.AUTHORIZED
            ? AUTH_OUTCOME.SUCCESS
            : status === ORDER_STATUS.ERROR
            ? AUTH_OUTCOME.INCORRECT_DETAILS
            : AUTH_OUTCOME.SUCCESS; // default

        insertAuth.run(order_id, provider_token, toMoney(amount), outcome, created_at);
      }

      // set sequence = 1007 so next generated order is ORD-1008
      setSequence(db, 1007);
    })();

    console.log('✅ Database reset to original seven orders (with auth records).');
    console.log('   Orders:', ORIGINAL_SEVEN.map(r => r[0]).join(', '));
    console.log('   Next /api/orders/next → ORD-1008');
    console.log(`   DB: ${DB_PATH}`);
  } catch (err) {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

resetToOriginalSeven();
