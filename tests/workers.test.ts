import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { OutboxWorker } from '../src/workers/outbox_worker.js';
import { Sweeper } from '../src/workers/sweeper.js';
import { BookingService } from '../src/core/booking_service.js';
import { buildServer } from '../src/api/server.js';
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

  it('OutboxWorker dispatches pending events to webhook receiver with deduplication header', async () => {
    const slotStart = DateTime.utc().plus({ days: 8 }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    // 1. Create and confirm a booking
    const hold = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart });
    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Outbox Guest',
      guestEmail: 'outbox_guest@example.com',
    });

    // 2. Outbox table has pending notification
    const pendingRes = await pool.query(`
      SELECT * FROM notifications WHERE payload->>'booking_id' = $1 AND status = 'pending'
    `, [confirmed.booking_id]);
    expect(pendingRes.rows.length).toBe(1);

    // 3. Process with OutboxWorker
    const worker = new OutboxWorker('http://127.0.0.1:3001/api/mock-webhook');
    const processed = await worker.processPendingEvents();
    expect(processed).toBeGreaterThan(0);

    // 4. Notification status is now delivered
    const deliveredRes = await pool.query(`
      SELECT * FROM notifications WHERE id = $1
    `, [pendingRes.rows[0].id]);
    expect(deliveredRes.rows[0].status).toBe('delivered');
    expect(deliveredRes.rows[0].delivered_at).not.toBeNull();

    // 5. Mock webhook endpoint received the payload
    const logsRes = await app.inject({ method: 'GET', url: '/api/mock-webhook/logs' });
    const logs = JSON.parse(logsRes.body);
    const receivedEvent = logs.find((l: any) => l.payload.event_id === pendingRes.rows[0].id);
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.payload.payload.guest_name).toBe('Outbox Guest');
  });

  it('Sweeper cleans up expired holds and marks empty sessions released', async () => {
    const slotStart = DateTime.utc().plus({ days: 9 }).set({ hour: 11, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    // 1. Create a hold
    const hold = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart });

    // 2. Backdate expiry
    await pool.query(`
      UPDATE bookings SET hold_expires_at = NOW() - interval '10 seconds' WHERE id = $1
    `, [hold.data.hold_id]);

    // 3. Run sweeper
    const sweeper = new Sweeper();
    const result = await sweeper.sweepExpiredHolds();

    expect(result.expiredBookings).toBeGreaterThanOrEqual(1);

    // 4. Verify booking is expired and session is released
    const bCheck = await pool.query('SELECT status FROM bookings WHERE id = $1', [hold.data.hold_id]);
    expect(bCheck.rows[0].status).toBe('expired');

    const sCheck = await pool.query('SELECT status FROM sessions WHERE id = $1', [hold.data.session_id]);
    expect(sCheck.rows[0].status).toBe('released');
  });
});
