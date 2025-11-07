// src/routes/settlements.js
import { Router } from 'express';
import { ORDER_STATUS } from '../shared/constants.js';

import {
  getOrder,
  getAuthorizationByOrderId,
  sumSettlementsForOrder,
  createSettlement,
  updateOrderStatus,
} from '../db/index.js';

const router = Router();

// helpers
const toMoney = (n) => Number(Number(n).toFixed(2));
const hasTwoDecimalsMax = (n) => Number.isFinite(n) && Math.round(n * 100) === n * 100;

router.post('/', async (req, res) => {
  try {
    // normalize inputs
    let { orderId, amount } = req.body || {};
    orderId = (orderId ?? '').toString().trim();
    amount = Number(amount);

    // basic request validation
    if (!orderId || !Number.isFinite(amount)) {
      return res.status(400).json({ code: 'BAD_REQUEST' });
    }
    if (amount <= 0) {
      return res.status(422).json({ code: 'INVALID_AMOUNT' });
    }
    if (!hasTwoDecimalsMax(amount)) {
      return res.status(422).json({ code: 'INVALID_AMOUNT_PRECISION' });
    }

    // 1) order must exist
    const order = await getOrder(orderId);
    if (!order) {
      return res.status(404).json({ code: 'ORDER_NOT_FOUND' });
    }

    // 2) must have a successful/approved authorization for this order
    const auth = await getAuthorizationByOrderId(orderId);
    if (!auth || auth.outcome !== 'SUCCESS') {
      return res.status(409).json({ code: 'NO_APPROVED_AUTH' });
    }

    // 3) compute remaining authorized amount
    const settledSoFar = (await sumSettlementsForOrder(orderId)) ?? 0;
    const authorized = toMoney(auth.amount);
    const available = toMoney(authorized - settledSoFar);

    if (amount > available) {
      // Preserving your current behavior: 422 when exceeding available
      return res
        .status(422)
        .json({ code: 'AMOUNT_EXCEEDS_AVAILABLE', availableToSettle: available });
    }

    // 4) create the settlement
    const settlement = await createSettlement({
      order_id: orderId,
      amount: toMoney(amount),
      outcome: 'SUCCESS',
    });

    // 5) update order status (SETTLED if no remaining, else stay AUTHORIZED)
    const remaining = toMoney(available - amount);
    const newStatus = remaining === 0 ? ORDER_STATUS.SETTLED : ORDER_STATUS.AUTHORIZED;
    await updateOrderStatus(orderId, newStatus);

    // 6) response
    return res.json({
      orderId,
      status: newStatus,
      availableToSettle: remaining,
      settlement: {
        id: settlement.settlement_id ?? settlement.id,
        amount: settlement.amount,
        createdAt: settlement.created_at ?? settlement.createdAt,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

export default router;
