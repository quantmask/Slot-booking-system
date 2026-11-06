import dotenv from 'dotenv';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { buildServer } from './api/server.js';
import { OutboxWorker } from './workers/outbox_worker.js';
import { Sweeper } from './workers/sweeper.js';
import { pool } from './db/pool.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  console.log('====================================================');
  console.log('  Slotbook: High-Reliability Scheduling Engine      ');
  console.log('====================================================');

  // 1. Run Migrations
  try {
    await runMigrations();
  } catch (err) {
    console.error('[Main] Migration failed:', err);
    process.exit(1);
  }

  // 2. Ensure Seed Data
  try {
    const hostCheck = await pool.query("SELECT id FROM hosts WHERE slug = 'alex'");
    if (hostCheck.rows.length === 0) {
      console.log('[Main] Demo host not detected, running database seed...');
      await seedDatabase();
    } else {
      console.log('[Main] Demo host already present in database.');
    }
  } catch (err) {
    console.error('[Main] Seeding check failed:', err);
  }

  // 3. Build & Start HTTP API Server
  const server = buildServer();
  await server.listen({ port: PORT, host: HOST });
  console.log(`[Server] Fastify API & UI listening at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);

  // 4. Start Background Outbox Worker & Sweeper
  const outboxWorker = new OutboxWorker();
  outboxWorker.start(2000);

  const sweeper = new Sweeper();
  sweeper.start(30000);

  // Graceful Shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Main] Received ${signal}. Shutting down gracefully...`);
    outboxWorker.stop();
    sweeper.stop();
    await server.close();
    await pool.end();
    console.log('[Main] All resources released. Goodbye.');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[Main] Fatal bootstrap error:', err);
  process.exit(1);
});
