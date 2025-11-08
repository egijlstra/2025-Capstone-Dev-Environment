// --------------------------------------------------------------------
// index.js
// Main entry point for the Express server application
// Sets up middleware, routes, and error handling
// and starts the server listening on the specified port.
// --------------------------------------------------------------------
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { PROVIDER_BASE_URL } from './src/shared/constants.js';

// Routers
import ordersRouter from './src/routes/orders.js';
import settlementsRouter from './src/routes/settlements.js';
import authorizeRouter from './src/routes/authorize.js';
import orderNextRouter from './src/routes/order-next.js';

const app = express();

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  })
);
app.use(express.json());

// --- Health + root ---
app.get('/', (_req, res) => {
  res.send('API is running. See /health and /api/* routes.');
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'payments-capstone-api',
    providerBase: process.env.PROVIDER_BASE_URL || PROVIDER_BASE_URL,
    time: new Date().toISOString(),
  });
});

// --- API routes ---
// Mount the exact path first so it can’t be treated as an :id
app.use('/api/orders/next', orderNextRouter);

// Then the generic orders router (which contains /:id)
app.use('/api/orders', ordersRouter);

// Other routers
app.use('/api/settlements', settlementsRouter);
app.use('/api/authorize', authorizeRouter);

// --- Error handler baseline ---
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ code: 'SERVER_ERROR' });
});

// --- Boot ---
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

export default app;
