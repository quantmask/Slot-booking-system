import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool } from '../config/db.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../seeds/seed.js';
import { OutboxWorker } from '../services/OutboxWorker.js';
import { Sweeper } from '../services/Sweeper.js';
import { BookingService } from '../services/BookingService.js';
import { buildServer } from '../server.js';
import { FastifyInstance } from 'fastify';
import { DateTime } from 'luxon';

describe('Asynchronous Workers (Outbox Worker & Sweeper)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    app = buildServer();
    await app.listen({ port: 3001, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM notifications;');
    await pool.query('DELETE FROM bookings;');
    await pool.query('DELETE FROM sessions;');
    await pool.query('DELETE FROM idempotency_keys;');
  });

  it('OutboxWorker dispatches pending events to webhook receiver with deduplication header', async () => {
    const slotStart = DateTime.utc().plus({ days: 8 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const hold = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart });
    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Outbox Guest',
      guestEmail: 'outbox_guest@example.com',
    });

    const pendingRes = await pool.query(`
      SELECT * FROM notifications WHERE payload->>'booking_id' = $1 AND status = 'pending'
    `, [confirmed.booking_id]);
    expect(pendingRes.rows.length).toBe(1);

    const worker = new OutboxWorker('http://127.0.0.1:3001/api/mock-webhook');
    const processed = await worker.processPendingEvents();
    expect(processed).toBeGreaterThan(0);

    const deliveredRes = await pool.query(`
      SELECT * FROM notifications WHERE id = $1
    `, [pendingRes.rows[0].id]);
    expect(deliveredRes.rows[0].status).toBe('delivered');
    expect(deliveredRes.rows[0].delivered_at).not.toBeNull();

    const logsRes = await app.inject({ method: 'GET', url: '/api/mock-webhook/logs' });
    const logs = JSON.parse(logsRes.body);
    const receivedEvent = logs.find((l: any) => l.payload.event_id === pendingRes.rows[0].id);
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.payload.payload.guest_name).toBe('Outbox Guest');
  });

  it('Sweeper cleans up expired holds and marks empty sessions released', async () => {
    const slotStart = DateTime.utc().plus({ days: 9 }).set({ hour: 11, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const hold = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart });

    await pool.query(`
      UPDATE bookings SET hold_expires_at = NOW() - interval '10 seconds' WHERE id = $1
    `, [hold.data.hold_id]);

    const sweeper = new Sweeper();
    const result = await sweeper.sweepExpiredHolds();

    expect(result.expiredBookings).toBeGreaterThanOrEqual(1);

    const bCheck = await pool.query('SELECT status FROM bookings WHERE id = $1', [hold.data.hold_id]);
    expect(bCheck.rows[0].status).toBe('expired');

    const sCheck = await pool.query('SELECT status FROM sessions WHERE id = $1', [hold.data.session_id]);
    expect(sCheck.rows[0].status).toBe('released');
  });
});

