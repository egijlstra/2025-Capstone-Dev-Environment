// --------------------------------------------------------------------
// src/db/sqlite.js
// Implements a SQLite database connection using better-sqlite3
// Exports a shared database instance and a helper to get it
// --------------------------------------------------------------------
import 'dotenv/config';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Resolve DB path: prefer env, else ./database/database.db relative to project root
function resolveDbPath() {
  const envPath = process.env.DB_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const fallback = path.resolve(process.cwd(), 'database', 'database.db');
  if (fs.existsSync(fallback)) return fallback;

  // If neither exists, create the /database folder and file (Better-SQLite3 will create file)
  const folder = path.resolve(process.cwd(), 'database');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return fallback;
}

const dbPath = resolveDbPath();

// Open a single shared connection (synchronous driver)
export const db = new Database(dbPath, { fileMustExist: false });

// Optional: enable foreign keys if your schema uses them
try {
  db.pragma('foreign_keys = ON');
} catch {
  // swallow pragma errors safely
}

// Export default for compatibility with any existing default imports
export default db;

// Named export for explicit imports
export function getDb() { return db; }
