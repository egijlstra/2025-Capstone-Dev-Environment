Group 10 – Development Plan (Milestone 3 → Final)

This plan outlines coding responsibilities for Erik (warehouse UI + Node.js backend functions) and integration points with teammates. Each item can be turned into a GitHub issue with acceptance criteria.

A) API Foundation & Project Setup

 Project folder structure (/api, /db, /routes, /utils, /docs)

 .env with PORT, MOCK_PROVIDER_URL, CLIENT_ORIGIN

 Express setup: JSON parsing, CORS, error handler, logging

 Shared constants: statuses (PENDING, AUTHORIZED, SETTLED, ERROR), token prefix

 Utility functions: maskCardNumberToLast4, decimal helpers, input validators

Deliverables: folder skeleton, .env.example, README.md setup steps

B) Data Access Layer (coordination with Felix)

 Define DAL functions:

Orders: createOrUpdateOrder, updateOrderStatus, getOrderById, listOrders

Authorizations: saveAuthorization, getAuthorizationByOrderId

Settlements: createSettlement, listSettlementsByOrderId

 Agree on field names/types (amount as DECIMAL in dollars)

 Define expected error responses (not found, conflict)

Deliverables: db/contracts.md, stub modules with placeholder functions

C) API Endpoints

 POST /api/authorize

Validate input, mask card, call Beeceptor mock API

Save authorization, update order status, return JSON with masked card + outcome

 POST /api/settlements

Validate, fetch authorization, compare amount

Save settlement, update order status if success

 GET /api/orders

Supports query params for filtering (status) and sorting (created_at)

 GET /api/orders/:orderId

Returns order + authorization + settlements

 GET /health simple check { ok: true }

Deliverables: route files, api/contracts.md with request/response examples

D) Warehouse UI (React)

 Create /warehouse page with settlement form (orderId + amount)

 Client-side validation for required fields

 Connect form to POST /api/settlements

 Display response outcome (SUCCESS or EXCEEDS_AUTH) in banner

 (Optional) show authorization amount + settlement history below form

Deliverables: React component, basic styling, README usage note

E) Integration Points with Teammates

 For Mariah: confirm /api/authorize request/response schema, card formats, masking

 For Prisca: confirm /api/orders query params + response shape

 For Felix: align DB schema with DAL function names and amount handling

Deliverables: docs/api-quickstart.md with sample requests/responses

F) Quality & Config

 Enable CORS for client origin

 Friendly error messages, detailed logs only on server

 Request logging (authorize + settlement outcomes)

 NPM scripts: dev (nodemon), start

 ESLint + Prettier configs for consistent style

G) Testing & Demo Assets

 Thunder Client collection covering all endpoints

 Manual checklist for testing flows (see Technical Requirements doc)

 Example sample data creation (ORD-1001 to ORD-1004)

Deliverables: thunder-collection.json, docs/demo-steps.md

H) Stretch Goals / Nice-to-Haves

 Swagger/OpenAPI mini spec for routes

 Light rate limiting on /api/authorize and /api/settlements

 Graceful retries for mock provider 500 errors

 Pagination for /api/orders

Definition of Done

 /api/authorize & /api/settlements fully functional per business rules

 Orders can be listed, filtered, and sorted by UI

 Warehouse form submits settlements and shows outcome clearly

 API contracts documented so teammates can integrate without guessing

 Thunder Client demo flows cleanly for presentation