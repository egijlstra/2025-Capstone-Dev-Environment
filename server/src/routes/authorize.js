// src/routes/authorize.js
import { Router } from 'express';
import { ORDER_STATUS, AUTH_OUTCOME, PROVIDER_BASE_URL, STATIC_TOKEN_PREFIX } from '../shared/constants.js';

import {
  getOrder,
  createOrder,
  updateOrderStatus,
  createAuthorization,
} from '../db/index.js';

// Enable debug logging if DEBUG_AUTH=1 is set
const DEBUG = String(process.env.DEBUG_AUTH || '') === '1';

const router = Router();

// helpers
const last4 = (pan = '') => (pan.replace(/\D/g, '').slice(-4) || '0000');
const toMoney = (n) => Number(Number(n).toFixed(2));

/**
 * POST /api/authorize
 * Body (canonical expected by this route):
 * {
 *   "orderId": "ORD123456",
 *   "customer": { "firstName":"", "lastName":"", "address":"", "zip":"" },
 *   "card": { "number":"4111...", "expMonth":"08", "expYear":"2028", "cvv":"123", "name":"John Doe" },
 *   "requestedAmount": 50.00
 * }
 */
router.post('/', async (req, res) => {
  if (DEBUG) console.log('[AUTH] incoming body:', JSON.stringify(req.body));
  try {
    // --- normalize incoming UI variants into the canonical shape above ---
    // This preserves contract while accepting newer/simpler payloads from the checkout UI.
    const b = req.body ?? {};

    // Order ID
    const normOrderId = b.orderId ?? b.order_id ?? '';

    // Amount (accept requestedAmount or amount; coerce string -> number)
    const normRequestedAmount =
      typeof b.requestedAmount === 'number'
        ? b.requestedAmount
        : (typeof b.amount === 'string' ? Number(b.amount) : b.amount);

    // Card number (may be at b.card.number or b.cardNumber or b.card)
    const rawCardNumber = b.card?.number ?? b.cardNumber ?? b.card ?? '';
    const normCardNumber = String(rawCardNumber).replace(/\D/g, ''); // strip spaces/dashes

    // Expiry: accept {expMonth, expYear} or "MM/YY" (expiry / expiryDate)
    let expMonth = b.card?.expMonth ?? '';
    let expYear = b.card?.expYear ?? '';
    const expStr = (b.expiry ?? b.expiryDate ?? '').toString().trim();
    if ((!expMonth || !expYear) && expStr) {
      // try to parse "MM/YY" or "MMYY"
      let mm = '', yy = '';
      if (expStr.includes('/')) {
        const [m, y] = expStr.split('/');
        mm = (m ?? '').trim();
        yy = (y ?? '').trim();
      } else {
        // e.g., "1227"
        mm = expStr.slice(0, 2);
        yy = expStr.slice(2);
      }
      if (mm && !expMonth) expMonth = mm.padStart(2, '0');
      if (yy && !expYear) {
        expYear = yy.length === 2 ? `20${yy}` : yy; // naive 20YY expansion
      }
    }
    expMonth = String(expMonth ?? '').padStart(2, '0');
    expYear = String(expYear ?? '');

    // CVV
    const normCvv = String(b.card?.cvv ?? b.cvv ?? b.cvc ?? b.securityCode ?? '').trim();

    // Cardholder name (for fallback first/last if customer not provided)
    const holderName = b.card?.name ?? b.nameOnCard ?? b.cardName ?? '';
    let fallbackFirst = '', fallbackLast = '';
    if (holderName) {
      const parts = String(holderName).trim().split(/\s+/);
      fallbackFirst = parts[0] ?? '';
      fallbackLast = parts.slice(1).join(' ') || '';
    }

    // Build customer object:
    // Prefer explicit b.customer; else accept flat fields; else derive first/last from holder name.
    const normalizedCustomer =
      (b.customer && typeof b.customer === 'object')
        ? b.customer
        : {
            firstName: (b.firstName ?? fallbackFirst)?.toString().trim(),
            lastName : (b.lastName  ?? fallbackLast )?.toString().trim(),
            address  : (b.address   ?? ''          )?.toString().trim(),
            zip      : (b.zip       ?? ''          )?.toString().trim(),
          };

    // Build card object if caller didn't already send canonical shape
    const normalizedCard = b.card ?? {
      number  : normCardNumber,
      expMonth: expMonth,
      expYear : expYear,
      cvv     : normCvv,
      name    : holderName,
    };

    // Merge back onto req.body so existing logic below can stay the same
    req.body = {
      ...b,
      orderId: normOrderId,
      requestedAmount: normRequestedAmount,
      customer: normalizedCustomer,
      card: normalizedCard,
    };
    // --- end normalization ---

    const { orderId, customer, card, requestedAmount } = req.body || {};

    // --- basic validation ---
    if (!orderId || !card || typeof requestedAmount !== 'number') {
      return res.status(400).json({ code: 'BAD_REQUEST' });
    }
    if (requestedAmount <= 0 || !Number.isFinite(requestedAmount)) {
      return res.status(422).json({ code: 'INVALID_AMOUNT' });
    }

    // ensure order exists (create if not present so checkout flow is smooth)
    let order = await getOrder(orderId);
    if (!order) {
      order = await createOrder({
        order_id: orderId,
        status: ORDER_STATUS.PENDING,
        customer_name: customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : '',
        card_last4: last4(card.number),
        amount: toMoney(requestedAmount),
        created_at: new Date().toISOString(),
      });
    }

    // --- build provider payload per brief ---
    const payload = {
      OrderId: orderId,
      CardDetails: {
        CardNumber: String(card.number ?? ''),
        CardMonth: String(card.expMonth ?? ''),
        CardYear: String(card.expYear ?? ''),
        CCV: String(card.cvv ?? ''),
      },
      RequestedAmount: toMoney(requestedAmount),
    };

    // --- call mock provider (Beeceptor) ---
    const url = `${process.env.PROVIDER_BASE_URL || PROVIDER_BASE_URL}/authorize`;
    let providerStatus = 500;
    let providerBody = null;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      providerStatus = resp.status;
      // Beeceptor might respond with JSON or text; try JSON then fallback
      try {
        providerBody = await resp.json();
      } catch {
        providerBody = { raw: await resp.text() };
      }
    } catch (_netErr) {
      // network failure → treat as provider error
      providerStatus = 500;
      providerBody = { error: 'NETWORK_ERROR' };
    }

    // --- map provider status & body to our outcome ---
    let outcome = AUTH_OUTCOME.SERVER_ERROR;

    if (providerStatus === 200) {
      // Beeceptor puts scenario text in body.Reason or body.Success
      const reason = providerBody?.Reason?.toLowerCase?.() || '';
      if (providerBody?.Success === true) {
        outcome = AUTH_OUTCOME.SUCCESS;
      } else if (reason.includes('insufficient')) {
        outcome = AUTH_OUTCOME.INSUFFICIENT_FUNDS;
      } else if (reason.includes('incorrect') || reason.includes('invalid')) {
        outcome = AUTH_OUTCOME.INCORRECT_DETAILS;
      } else {
        outcome = AUTH_OUTCOME.SERVER_ERROR;
      }
    } else if (providerStatus === 402) {
      outcome = AUTH_OUTCOME.INSUFFICIENT_FUNDS;
    } else if (providerStatus === 422) {
      outcome = AUTH_OUTCOME.INCORRECT_DETAILS;
    }

    // --- persist authorization record (never store PAN/CVV) ---
    const provider_token = `${STATIC_TOKEN_PREFIX}${orderId}`;
    await createAuthorization({
      order_id: orderId,
      provider_token,
      amount: toMoney(requestedAmount),
      outcome, // SUCCESS | INSUFFICIENT_FUNDS | INCORRECT_DETAILS | SERVER_ERROR
    });

    // --- set order status based on outcome ---
    if (outcome === AUTH_OUTCOME.SUCCESS) {
      await updateOrderStatus(orderId, ORDER_STATUS.AUTHORIZED);
      const response = {
        orderId,
        status: ORDER_STATUS.AUTHORIZED,
        authorization: {
          token: provider_token,
          maskedCard: `**** **** **** ${last4(card.number)}`,
          amount: toMoney(requestedAmount),
          providerRef: 'beeceptor',
        },
        provider: { status: providerStatus, body: providerBody }, // helpful for debugging
      };
      return res.status(200).json(response);
    }

    // failure cases
    if (outcome === AUTH_OUTCOME.INSUFFICIENT_FUNDS) {
      await updateOrderStatus(orderId, ORDER_STATUS.ERROR);
      return res.status(402).json({ orderId, status: 'DECLINED', code: 'INSUFFICIENT_FUNDS' });
    }

    if (outcome === AUTH_OUTCOME.INCORRECT_DETAILS) {
      await updateOrderStatus(orderId, ORDER_STATUS.ERROR);
      return res.status(422).json({ orderId, status: 'DECLINED', code: 'INCORRECT_DETAILS' });
    }

    await updateOrderStatus(orderId, ORDER_STATUS.ERROR);
    return res.status(502).json({ orderId, status: 'ERROR', code: 'PROVIDER_ERROR' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ code: 'SERVER_ERROR' });
  }
});

export default router;
