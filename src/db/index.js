// src/db/index.js
console.log('Using sqlite.js from:', import.meta.url);
import { db } from './sqlite.js'; // shared singleton connection

// --- orders ---
export async function getOrder(orderId) {
  return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
}

export async function listOrders() {
  return db.prepare('SELECT * FROM orders ORDER BY datetime(created_at) DESC').all();
}

export async function createOrder({ order_id, customer_name, card_last4, amount, status }) {
  db.prepare(
    'INSERT INTO orders (order_id, status, customer_name, card_last4, amount) VALUES (?, ?, ?, ?, ?)'
  ).run(order_id, status, customer_name, card_last4, amount);
  return getOrder(order_id);
}

export async function updateOrderStatus(orderId, newStatus) {
  db.prepare('UPDATE orders SET status = ? WHERE order_id = ?').run(newStatus, orderId);
  return getOrder(orderId);
}

// --- authorizations ---
export async function getAuthorizationByOrderId(orderId) {
  return db
    .prepare(
      'SELECT * FROM authorizations WHERE order_id = ? ORDER BY datetime(created_at) DESC LIMIT 1'
    )
    .get(orderId);
}

export async function createAuthorization({ order_id, provider_token, amount, outcome }) {
  db.prepare(
    'INSERT INTO authorizations (order_id, provider_token, amount, outcome) VALUES (?, ?, ?, ?)'
  ).run(order_id, provider_token, amount, outcome);
  return getAuthorizationByOrderId(order_id);
}

// --- settlements ---
export async function listSettlementsByOrderId(orderId) {
  return db
    .prepare('SELECT * FROM settlements WHERE order_id = ? ORDER BY datetime(created_at)')
    .all(orderId);
}

export async function sumSettlementsForOrder(orderId) {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM settlements WHERE order_id = ? AND outcome = 'SUCCESS'"
    )
    .get(orderId);
  return Number(row.total);
}

export async function createSettlement({ order_id, amount, outcome }) {
  db.prepare('INSERT INTO settlements (order_id, amount, outcome) VALUES (?, ?, ?)').run(
    order_id,
    amount,
    outcome
  );
  return { order_id, amount, outcome };
}
