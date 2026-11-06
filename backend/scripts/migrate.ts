import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[Migrator] Initializing database migrations...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsDir = path.resolve(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[Migrator] No migrations directory found at:', migrationsDir);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [file]
    );

    if (rows.length === 0) {
      console.log(`[Migrator] Applying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
      });
      console.log(`[Migrator] Successfully applied ${file}`);
    } else {
      console.log(`[Migrator] Migration ${file} already applied, skipping.`);
    }
  }

  console.log('[Migrator] All migrations up to date.');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migrator] Migration failed:', err);
      process.exit(1);
    });
}

