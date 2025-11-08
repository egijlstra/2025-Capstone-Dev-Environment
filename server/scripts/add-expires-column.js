// scripts/add-expires-column.js
// Script to add expires_at column to authorizations table
// Run with: node scripts/add-expires-column.js
// Intended for one-time use during migrations
import { db } from '../src/db/sqlite.js';

try {
  db.prepare('ALTER TABLE authorizations ADD COLUMN expires_at TEXT;').run();
  console.log('✅ Column expires_at added to authorizations.');
} catch (err) {
  if (err.message.includes('duplicate column name')) {
    console.log('ℹ️ Column already exists, skipping.');
  } else {
    console.error('❌ Migration failed:', err);
  }
} finally {
  db.close();
}
