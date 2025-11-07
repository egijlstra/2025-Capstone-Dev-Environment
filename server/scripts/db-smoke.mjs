#!/usr/bin/env node
// scripts/db-smoke.mjs
// Runs a tiny end-to-end through the adapter.
// Usage: node scripts/db-smoke.mjs

import {
  getOrder,
  listOrders,
  createOrder,
  updateOrderStatus,
  getAuthorizationByOrderId,
  createAuthorization,
  listSettlementsByOrderId,
  sumSettlementsForOrder,
  createSettlement,
} from '../src/db/index.js';

function hr(title) {
  console.log('\n=== ' + title + ' ===');
}

async function run() {
  const testId = 'ORD-ADAPTER-SMOKE-001';

  hr('Create Order');
  const created = await createOrder({
    order_id: testId,
    customer_name: 'Ada Lovelace',
    card_last4: '4242',
    amount: 199.99,
    status: 'PENDING',
  });
  console.log(created);

  hr('Update Order Status -> AUTHORIZED');
  const upd = await updateOrderStatus(testId, 'AUTHORIZED');
  console.log(upd);

  hr('Create Authorization (SUCCESS)');
  const auth = await createAuthorization({
    order_id: testId,
    provider_token: `STATIC_TOKEN_${testId}`,
    amount: 199.99,
    outcome: 'SUCCESS',
  });
  console.log(auth);

  hr('Get Authorization By Order');
  const gotAuth = await getAuthorizationByOrderId(testId);
  console.log(gotAuth);

  hr('Create Settlement (partial)');
  const s1 = await createSettlement({ order_id: testId, amount: 50, outcome: 'SUCCESS' });
  console.log(s1);

  hr('Create Settlement (exceeds for demo)');
  const s2 = await createSettlement({ order_id: testId, amount: 200, outcome: 'EXCEEDS_AUTH' });
  console.log(s2);

  hr('List Settlements');
  const settlements = await listSettlementsByOrderId(testId);
  console.log(settlements);

  hr('Sum Successful Settlements');
  const sum = await sumSettlementsForOrder(testId);
  console.log({ sum });

  hr('List Orders q=testId');
  const list = await listOrders({ q: testId, sort: 'created_at', dir: 'DESC' });
  console.log(list);

  hr('Get Order');
  const fetched = await getOrder(testId);
  console.log(fetched);

  console.log('\nSmoke test finished.\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
