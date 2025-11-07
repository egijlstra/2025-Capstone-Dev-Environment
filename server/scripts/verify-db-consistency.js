// scripts/verify-db-consistency.js
// ESM friendly; uses your existing Better-SQLite3 instance.

import { db } from '../src/db/sqlite.js';

function money(n) {
  return Number(n ?? 0);
}
function isTwoDecimals(n) {
  return Math.round(n * 100) === n * 100;
}

function logHead(title) {
  console.log('\n=== ' + title + ' ===');
}

function fail(msg) {
  console.log('❌  ' + msg);
  process.exitCode = 1;
}
function pass(msg) {
  console.log('✅  ' + msg);
}

try {
  // Basic presence
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table'
  `).all().map(r => r.name);

  const needed = ['orders', 'authorizations', 'settlements'];
  for (const t of needed) {
    if (!tables.includes(t)) {
      fail(`Missing required table: ${t}`);
    }
  }

  // 1) Duplicate order IDs
  logHead('Duplicate Order IDs');
  const dups = db.prepare(`
    SELECT order_id, COUNT(*) c
    FROM orders
    GROUP BY order_id
    HAVING c > 1
  `).all();

  if (dups.length) {
    dups.forEach(d => fail(`Duplicate order_id in orders: ${d.order_id} (count ${d.c})`));
  } else {
    pass('No duplicate order_id rows in orders.');
  }

  // 2) Orphans in authorizations / settlements
  logHead('Orphan Rows');
  const authOrphans = db.prepare(`
    SELECT a.order_id, a.rowid AS rid
    FROM authorizations a
    LEFT JOIN orders o ON o.order_id = a.order_id
    WHERE o.order_id IS NULL
  `).all();
  const setOrphans = db.prepare(`
    SELECT s.order_id, s.rowid AS rid
    FROM settlements s
    LEFT JOIN orders o ON o.order_id = s.order_id
    WHERE o.order_id IS NULL
  `).all();

  if (authOrphans.length) {
    authOrphans.forEach(r => fail(`Authorization orphan: order_id=${r.order_id} (rowid ${r.rid})`));
  } else {
    pass('No orphan authorizations.');
  }
  if (setOrphans.length) {
    setOrphans.forEach(r => fail(`Settlement orphan: order_id=${r.order_id} (rowid ${r.rid})`));
  } else {
    pass('No orphan settlements.');
  }

  // 3) Monetary precision checks (≤ 2 decimals)
  logHead('Monetary Precision');
  const badOrderAmounts = db.prepare(`
    SELECT order_id, amount FROM orders
    WHERE amount IS NOT NULL
  `).all().filter(r => !isTwoDecimals(money(r.amount)));

  const badAuthAmounts = db.prepare(`
    SELECT order_id, amount FROM authorizations
    WHERE amount IS NOT NULL
  `).all().filter(r => !isTwoDecimals(money(r.amount)));

  const badSettleAmounts = db.prepare(`
    SELECT order_id, amount FROM settlements
    WHERE amount IS NOT NULL
  `).all().filter(r => !isTwoDecimals(money(r.amount)) || money(r.amount) < 0);

  if (badOrderAmounts.length) {
    badOrderAmounts.forEach(r =>
      fail(`orders.amount has >2 decimals: ${r.order_id} -> ${r.amount}`));
  } else {
    pass('All orders.amount values have ≤ 2 decimals.');
  }
  if (badAuthAmounts.length) {
    badAuthAmounts.forEach(r =>
      fail(`authorizations.amount has >2 decimals: ${r.order_id} -> ${r.amount}`));
  } else {
    pass('All authorizations.amount values have ≤ 2 decimals.');
  }
  if (badSettleAmounts.length) {
    badSettleAmounts.forEach(r =>
      fail(`settlements.amount invalid (neg or >2dp): ${r.order_id} -> ${r.amount}`));
  } else {
    pass('All settlements.amount values are ≥ 0 and ≤ 2 decimals.');
  }

  // Helper: latest SUCCESS authorization per order
  const latestSuccessAuthStmt = db.prepare(`
    SELECT a.order_id, a.amount, a.created_at
    FROM authorizations a
    WHERE a.order_id = ? AND a.outcome = 'SUCCESS'
    ORDER BY datetime(a.created_at) DESC, rowid DESC
    LIMIT 1
  `);

  // Sum of successful settlements per order
  const sumSettleStmt = db.prepare(`
    SELECT COALESCE(SUM(amount),0) AS total
    FROM settlements
    WHERE order_id = ? AND outcome = 'SUCCESS'
  `);

  // 4) Per-order business rules
  logHead('Per-Order Authorization vs Settlements');

  const orders = db.prepare(`
    SELECT order_id, status FROM orders
  `).all();

  for (const o of orders) {
    const auth = latestSuccessAuthStmt.get(o.order_id); // may be undefined
    const settled = sumSettleStmt.get(o.order_id);
    const settledTotal = money(settled?.total || 0);

    if (auth) {
      const authAmount = money(auth.amount);

      // Rule A: total settlements must not exceed auth
      if (settledTotal > authAmount + 1e-9) {
        fail(`Over-settlement: ${o.order_id} settled ${settledTotal} > authorized ${authAmount}`);
      }

      // Rule B: if order is SETTLED, totals must exactly match auth
      if (String(o.status).toUpperCase() === 'SETTLED') {
        if (Math.abs(settledTotal - authAmount) > 1e-9) {
          fail(`SETTLED but mismatch: ${o.order_id} settled ${settledTotal} != authorized ${authAmount}`);
        }
      }
    } else {
      // No successful auth — ensure no successful settlements exist
      if (settledTotal > 0) {
        fail(`Settlements with no successful authorization: ${o.order_id} total ${settledTotal}`);
      }
    }
  }

  // If we haven’t set exitCode to 1 anywhere, all checks passed.
  if (!process.exitCode) {
    pass('All database consistency checks passed.');
  } else {
    console.log('\nOne or more checks failed (see ❌ above).');
  }
} catch (err) {
  console.error(err);
  fail('Unexpected error running DB consistency checks.');
}
