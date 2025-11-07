// src/routes/order-next.js
import { Router } from 'express';
import { getNextOrderIdORD, generateRandomAmount } from '../db/sequence.js';

const router = Router();

/**
 * Mounted at /api/orders/next
 * GET /api/orders/next
 * Response: { orderId: string, amount: number }
 */
router.get('/', (_req, res) => {
  try {
    const orderId = getNextOrderIdORD();
    const amount = generateRandomAmount();
    res.json({ orderId, amount });
  } catch (err) {
    console.error('Error generating next order/amount:', err);
    res.status(500).json({ error: 'FAILED_TO_GENERATE_NEXT_ORDER' });
  }
});

export default router;
