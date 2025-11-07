import { Router } from 'express';
const router = Router();

import {
  listOrders as dbListOrders,
  getOrder,
  getAuthorizationByOrderId,
  listSettlementsByOrderId,
  sumSettlementsForOrder,
} from '../db/index.js';

// helpers
const toNumber = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const cmpStr = (a = '', b = '') => a.localeCompare(b, undefined, { sensitivity: 'base' });
const cmpNum = (a = 0, b = 0) => a - b;
const cmpDate = (a, b) => new Date(a).getTime() - new Date(b).getTime();

// GET /api/orders  (list with optional status, q, sort, dir, page, pageSize)
router.get('/', async (req, res) => {
  try {
    const {
      status,
      q,
      sort = 'created_at',
      dir = 'desc',
      page = '1',
      pageSize = '20',
    } = req.query;

    let rows = await dbListOrders();

    if (status) {
      rows = rows.filter(r => String(r.status) === String(status));
    }

    if (q) {
      const needle = String(q).toLowerCase();
      rows = rows.filter(r =>
        String(r.order_id).toLowerCase().includes(needle) ||
        String(r.customer_name || '').toLowerCase().includes(needle)
      );
    }

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

    const p = Math.max(1, toNumber(page, 1));
    const ps = Math.max(1, toNumber(pageSize, 20));
    const start = (p - 1) * ps;
    const end = start + ps;

    return res.json(rows.slice(start, end));
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

// GET /api/orders/:id  (detail block for Settlement UI)
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

    // Preserve exact top-level shape required by your frontend
    return res.json({
      order,
      authorization,
      settlements,
      availableToSettle,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

export default router;
