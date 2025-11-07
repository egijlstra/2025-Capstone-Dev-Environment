// src/db/sequence.js
// Helper for computing the next sequential ORD-<number> order_id
import { db } from './sqlite.js';

/**
 * Returns the next order_id in the ORD-<number> sequence, ignoring
 * non-numeric demo IDs (e.g., ORD-WH-DEMO-001).
 * Example: if max ORD-1007 exists, returns ORD-1008.
 * If none exist, starts at ORD-1001.
 */
export function getNextOrderIdORD() {
  const rows = db
    .prepare("SELECT order_id FROM orders WHERE order_id LIKE 'ORD-%'")
    .all();

  let maxNum = 1000; // so next becomes 1001 when there's no valid numeric ORD- entries
  for (const r of rows) {
    const m = /^ORD-(\d+)$/.exec(r.order_id);
    if (!m) continue; // skip demo/non-numeric patterns
    const n = Number(m[1]);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  }
  const next = maxNum + 1;
  return `ORD-${next}`;
}

/**
 * Returns a realistic random amount, formatted to 2 decimals.
 * Example range: $19.00 — $499.00
 */
export function generateRandomAmount() {
  const min = 19.0;
  const max = 499.0;
  const raw = Math.random() * (max - min) + min;
  return Number(raw.toFixed(2));
}
