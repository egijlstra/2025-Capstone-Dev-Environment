// scripts/inspect-orders.js
// ESM-compatible script to inspect existing order_id values and infer sequence pattern
import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const resolveDbPath = () => {
  const envPath = process.env.DB_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // default ./database/database.db relative to project root
  const fallback = path.resolve(process.cwd(), 'database', 'database.db');
  if (fs.existsSync(fallback)) return fallback;

  console.error('Could not find database file. Checked:', envPath ?? '(no DB_PATH set)', 'and', fallback);
  process.exit(1);
};

const dbPath = resolveDbPath();
const db = new Database(dbPath, { readonly: true });

const rows = db.prepare(`
  SELECT order_id
  FROM orders
  WHERE order_id IS NOT NULL
  ORDER BY rowid ASC
  LIMIT 200
`).all();

if (rows.length === 0) {
  console.log('No orders found (orders table is empty or order_id is NULL).');
  process.exit(0);
}

console.log(`Loaded ${rows.length} order_id values from ${dbPath}\n`);
console.log('Sample (up to 20):');
rows.slice(0, 20).forEach(r => console.log('  ', r.order_id));
console.log('\nAnalysis:');

// Find numeric tail and prefix for each order_id
function analyze(id) {
  // capture everything up to last run of digits, and the digits
  const m = id.match(/^(.*?)(\d+)$/);
  if (!m) return null; // no numeric tail
  const prefix = m[1] ?? '';
  const digits = m[2];
  const num = Number(digits);
  return { id, prefix, digits, num, pad: digits.length };
}

// Build stats over all IDs that have numeric tails
const analyses = rows
  .map(r => r.order_id)
  .map(analyze)
  .filter(Boolean);

// Group by (prefix, pad)
const map = new Map();
for (const a of analyses) {
  const key = `${a.prefix}__PAD${a.pad}`;
  if (!map.has(key)) map.set(key, { prefix: a.prefix, pad: a.pad, maxNum: -Infinity, count: 0, examples: [] });
  const g = map.get(key);
  g.maxNum = Math.max(g.maxNum, a.num);
  g.count++;
  if (g.examples.length < 3) g.examples.push(a.id);
}

// Print groups
if (map.size === 0) {
  console.log('No sequential pattern with numeric tails detected.');
  console.log('Raw examples above may show a custom format you want me to match.');
  process.exit(0);
}

let chosen = null;
console.log('Detected sequence groups (prefix + padding):');
for (const g of map.values()) {
  console.log(`- prefix="${g.prefix}" pad=${g.pad} | count=${g.count} | max=${g.maxNum} | examples: ${g.examples.join(', ')}`);
  // Heuristic: choose the group with the highest count, tie-break by maxNum
  if (
    !chosen ||
    g.count > chosen.count ||
    (g.count === chosen.count && g.maxNum > chosen.maxNum)
  ) {
    chosen = g;
  }
}

if (chosen) {
  const nextNum = chosen.maxNum + 1;
  const nextId = `${chosen.prefix}${String(nextNum).padStart(chosen.pad, '0')}`;
  console.log('\nSuggested primary sequence to continue:');
  console.log(`- prefix="${chosen.prefix}" pad=${chosen.pad}`);
  console.log(`- next number: ${nextNum}`);
  console.log(`- suggested next order_id: ${nextId}`);
} else {
  console.log('\nCould not select a sequence to continue. Share the samples and I’ll tailor the generator.');
}

db.close();
