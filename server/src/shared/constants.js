// From Milestone 2: Order.status values
// PENDING, AUTHORIZED, SETTLED, ERROR
export const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  SETTLED: 'SETTLED',
  ERROR: 'ERROR',
});

// From Milestone 2: Authorization.outcome values
// SUCCESS, INSUFFICIENT_FUNDS, INCORRECT_DETAILS, SERVER_ERROR
export const AUTH_OUTCOME = Object.freeze({
  SUCCESS: 'SUCCESS',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  INCORRECT_DETAILS: 'INCORRECT_DETAILS',
  SERVER_ERROR: 'SERVER_ERROR',
});

// From Milestone 2: Settlement.outcome values
// SUCCESS, EXCEEDS_AUTH
export const SETTLEMENT_OUTCOME = Object.freeze({
  SUCCESS: 'SUCCESS',
  EXCEEDS_AUTH: 'EXCEEDS_AUTH',
});

// Beeceptor base from docs
export const PROVIDER_BASE_URL = 'https://capstoneproject.free.beeceptor.com';

// Token rule per docs: STATIC_TOKEN_<order_id>
export const STATIC_TOKEN_PREFIX = 'STATIC_TOKEN_';
