// src/routes/orders.js
import { Router } from 'express';
const router = Router();

import {
  listOrders as dbListOrders,
  getOrder,
  getAuthorizationByOrderId,
  listSettlementsByOrderId,
  sumSettlementsForOrder,
} from '../db/index.js';

// --- Helper functions ---
const cmpStr = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base' });
const cmpNum = (a = 0, b = 0) => a - b;
const cmpDate = (a, b) => new Date(a).getTime() - new Date(b).getTime();

// ===========================================================
// GET /api/orders
// Returns ALL orders (no pagination) with optional filtering and sorting.
// ===========================================================
router.get('/', async (req, res) => {
  try {
    const {
      status,
      q,
      sort = 'created_at',
      dir = 'desc',
    } = req.query;

    // --- Pull all rows from DB (no LIMIT or OFFSET) ---
    let rows = await dbListOrders();

    // --- Filter by status if provided ---
    if (status) {
      rows = rows.filter((r) => String(r.status).toUpperCase() === String(status).toUpperCase());
    }

    // --- Filter by search query (order ID or customer name) ---
    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.order_id).toLowerCase().includes(needle) ||
          String(r.customer_name || '').toLowerCase().includes(needle)
      );
    }

    // --- Sort results ---
    const dirSign = String(dir).toLowerCase() === 'asc' ? 1 : -1;
    const key = String(sort);
    rows.sort((a, b) => {
      let delta = 0;
      if (key === 'created_at') delta = cmpDate(a.created_at, b.created_at);
      else if (key === 'amount') delta = cmpNum(Number(a.amount || 0), Number(b.amount || 0));
      else if (key === 'customer_name') delta = cmpStr(a.customer_name, b.customer_name);
      else if (key === 'status') delta = cmpStr(a.status, b.status);
      else if (key === 'order_id') delta = cmpStr(a.order_id, b.order_id);
      else delta = cmpDate(a.created_at, b.created_at);
      return dirSign * delta;
    });

    // --- Return ALL rows (no pagination slicing) ---
    return res.json(rows);
  } catch (e) {
    console.error('Error listing orders:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

// ===========================================================
// GET /api/orders/:id
// Returns detailed order info for the Warehouse Settlement UI.
// ===========================================================
router.get('/:id', async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await getOrder(orderId);
    if (!order) {
      return res.status(404).json({ code: 'ORDER_NOT_FOUND' });
    }

    const authorization = await getAuthorizationByOrderId(orderId);
    const settlements = await listSettlementsByOrderId(orderId);
    const settled = await sumSettlementsForOrder(orderId);

    const authorizedAmt = authorization?.amount ?? 0;
    const availableToSettle = Math.max(0, Number((authorizedAmt - settled).toFixed(2)));

    return res.json({
      order,
      authorization,
      settlements,
      availableToSettle,
    });
  } catch (e) {
    console.error('Error fetching order details:', e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

export default router;
