// src/db/index.js
import { getDb } from './sqlite.js';

// --- orders ---
export async function getOrder(orderId) {
  const db = getDb();
  return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
}

export async function listOrders({ status, q, sort, dir, page, pageSize } = {}) {
  const db = getDb();

  // Minimal filtering to preserve adapter API; expand only if routes need it.
  const where = [];
  const params = [];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(order_id LIKE ? OR customer_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const orderCol = ['created_at', 'order_id', 'amount', 'status'].includes(sort) ? sort : 'created_at';
  const orderDir = String(dir || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let sql = `SELECT * FROM orders`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY ${orderCol} ${orderDir}`;

  if (pageSize && pageSize > 0) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.max(1, Number(pageSize) || 10);
    const offset = (p - 1) * ps;
    sql += ` LIMIT ${ps} OFFSET ${offset}`;
  }

  return db.prepare(sql).all(...params);
}

export async function createOrder({ order_id, customer_name, card_last4, amount, status }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO orders (order_id, status, customer_name, card_last4, amount)
     VALUES (?, ?, ?, ?, ?)`
  ).run(order_id, status, customer_name, card_last4, amount);
  return getOrder(order_id);
}

export async function updateOrderStatus(orderId, newStatus) {
  const db = getDb();
  db.prepare('UPDATE orders SET status = ? WHERE order_id = ?').run(newStatus, orderId);
  return getOrder(orderId);
}

// --- authorizations ---
export async function getAuthorizationByOrderId(orderId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM authorizations
       WHERE order_id = ?
       ORDER BY datetime(created_at) DESC
       LIMIT 1`
    )
    .get(orderId);
}

export async function createAuthorization({ order_id, provider_token, amount, outcome }) {
  const db = getDb();
  // UPSERT: keep a single authorization row per order_id; update on re-authorize attempt
  db.prepare(
    `INSERT INTO authorizations (order_id, provider_token, amount, outcome)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(order_id)
     DO UPDATE SET
       provider_token = excluded.provider_token,
       amount         = excluded.amount,
       outcome        = excluded.outcome,
       created_at     = CURRENT_TIMESTAMP`
  ).run(order_id, provider_token, amount, outcome);

  return getAuthorizationByOrderId(order_id);
}

// --- settlements ---
export async function listSettlementsByOrderId(orderId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM settlements
       WHERE order_id = ?
       ORDER BY datetime(created_at)`
    )
    .all(orderId);
}

export async function sumSettlementsForOrder(orderId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM settlements
       WHERE order_id = ? AND outcome = 'SUCCESS'`
    )
    .get(orderId);
  return Number(row.total);
}

export async function createSettlement({ order_id, amount, outcome }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO settlements (order_id, amount, outcome)
     VALUES (?, ?, ?)`
  ).run(order_id, amount, outcome);
  return { order_id, amount, outcome };
}
