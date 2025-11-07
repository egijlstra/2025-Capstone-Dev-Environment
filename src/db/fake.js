// super tiny in-memory store just for local testing
const orders = new Map([
  ['ORD1001', { order_id: 'ORD1001', status: 'AUTHORIZED', customer_name: 'Alice', card_last4: '4242', amount: 149.95, created_at: new Date().toISOString() }],
  ['ORD1002', { order_id: 'ORD1002', status: 'AUTHORIZED', customer_name: 'Bob',   card_last4: '1111', amount: 100.00, created_at: new Date().toISOString() }],
  ['ORD2001', { order_id: 'ORD2001', status: 'PENDING',    customer_name: 'Carol', card_last4: '0000', amount:  25.00, created_at: new Date().toISOString() }],
]);

const auths = new Map([
  ['ORD1001', { auth_id: 'auth_1001', order_id: 'ORD1001', amount: 149.95, outcome: 'SUCCESS', created_at: new Date().toISOString() }],
  ['ORD1002', { auth_id: 'auth_1002', order_id: 'ORD1002', amount: 100.00, outcome: 'SUCCESS', created_at: new Date().toISOString() }],
  // ORD2001 intentionally has no approved auth
]);

const settlements = new Map([
  ['ORD1002', [ { settlement_id: 'set_200', order_id: 'ORD1002', amount: 40.00, outcome: 'SUCCESS', created_at: new Date().toISOString() } ]]
]);

const ensureList = (orderId) => settlements.get(orderId) || [];

const db = {
  async getOrder(orderId) { return orders.get(orderId) || null; },

  async listOrders() {
    const rows = Array.from(orders.values());
    return { rows, total: rows.length };
  },

  async createOrder(row) { orders.set(row.order_id, row); return row; },

  async updateOrderStatus(orderId, newStatus) {
    const o = orders.get(orderId);
    if (!o) return null;
    o.status = newStatus;
    return { order_id: orderId, status: newStatus };
  },

  async getAuthorizationByOrderId(orderId) { return auths.get(orderId) || null; },

  async createAuthorization(row) { auths.set(row.order_id, row); return row; },

  async listSettlementsByOrderId(orderId) { return ensureList(orderId); },

  async sumSettlementsForOrder(orderId) {
    return ensureList(orderId).reduce((sum, s) => sum + Number(s.amount), 0);
  },

  async createSettlement(row) {
    const list = ensureList(row.order_id);
    const created = { settlement_id: `set_${Math.random().toString(36).slice(2,8)}`, created_at: new Date().toISOString(), ...row };
    settlements.set(row.order_id, [...list, created]);
    return created;
  },
};

export default db;
