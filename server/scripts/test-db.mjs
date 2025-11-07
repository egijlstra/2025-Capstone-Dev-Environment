// scripts/test-db.mjs
import { listOrders } from '../src/db/index.js';

const rows = await listOrders();
console.log('Orders in database:', rows);
