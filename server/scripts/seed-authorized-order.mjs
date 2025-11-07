#!/usr/bin/env node
// scripts/seed-authorized-order.mjs
// Creates a demo order and marks it AUTHORIZED so the Warehouse UI can settle it.

import {
  createOrder,
  updateOrderStatus,
  createAuthorization,
  getAuthorizationByOrderId,
  sumSettlementsForOrder,
} from '../src/db/index.js';

const toMoney = (n) => Number(Number(n).toFixed(2));

async function main() {
  const orderId = process.argv[2] || `ORD-DEMO-${Date.now()}`;
  const amount = Number(process.argv[3] || 79.99);
  const last4 = String(process.argv[4] || '4242');

  // 1) Create order (PENDING)
  await createOrder({
    order_id: orderId,
    status: 'PENDING',
    customer_name: 'Warehouse Demo',
    card_last4: last4,
    amount: toMoney(amount),
  });

  // 2) Create SUCCESS authorization + set status AUTHORIZED
  await createAuthorization({
    order_id: orderId,
    provider_token: `STATIC_TOKEN_${orderId}`,
    amount: toMoney(amount),
    outcome: 'SUCCESS',
  });

  await updateOrderStatus(orderId, 'AUTHORIZED');

  // 3) Show a quick summary you can eyeball
  const auth = await getAuthorizationByOrderId(orderId);
  const settledSoFar = await sumSettlementsForOrder(orderId);
  const available = toMoney((auth?.amount || 0) - settledSoFar);

  console.log('\n=== Authorized Order Ready ===');
  console.log('Order ID:           ', orderId);
  console.log('Authorized Amount:  ', auth?.amount ?? 0);
  console.log('Settled So Far:     ', settledSoFar);
  console.log('AvailableToSettle:  ', available);
  console.log('Card Last4:         ', last4);
  console.log('Token:              ', auth?.provider_token);
  console.log('\nUse this Order ID in the Warehouse UI to settle.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
