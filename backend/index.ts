import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './config/db.js';
import { runMigrations } from './scripts/migrate.js';
import { seedDatabase } from './seeds/seed.js';
import { buildServer } from './server.js';
import { OutboxWorker } from './services/OutboxWorker.js';
import { Sweeper } from './services/Sweeper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  console.log('====================================================');
  console.log('  Slotbook Backend Server                           ');
  console.log('====================================================');

  try {
    await runMigrations();
  } catch (err) {
    console.error('[Main] Migration failed:', err);
    process.exit(1);
  }

  try {
    const hostCheck = await pool.query("SELECT id FROM hosts WHERE slug = 'alex'");
    if (hostCheck.rows.length === 0) {
      console.log('[Main] Running database seed...');
      await seedDatabase();
    }
  } catch (err) {
    console.error('[Main] Seeding check failed:', err);
  }

  const server = buildServer();
  await server.listen({ port: PORT, host: HOST });
  console.log(`[Server] Fastify API listening at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);

  const outboxWorker = new OutboxWorker();
  outboxWorker.start(2000);

  const sweeper = new Sweeper();
  sweeper.start(30000);

  const shutdown = async (signal: string) => {
    console.log(`\n[Main] Received ${signal}. Shutting down gracefully...`);
    outboxWorker.stop();
    sweeper.stop();
    await server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Main] Fatal bootstrap error:', err);
  process.exit(1);
});

