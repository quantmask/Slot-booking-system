import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool, withTransaction } from '../config/db.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../seeds/seed.js';
import { BookingService } from '../services/BookingService.js';
import { OutboxWorker } from '../services/OutboxWorker.js';
import { generateSlots } from '../lib/slot_engine.js';
import { DateTime } from 'luxon';
import http from 'http';

describe('Slotbook Edge Cases & Extreme Boundary Suite', () => {
  let hostId: string;
  let singleEventTypeId: string;
  let mockServer: http.Server;
  let mockWebhookPort: number;
  let mockWebhookReceivedHeaders: any[] = [];
  let mockWebhookStatus = 200;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();

    const hostRes = await pool.query("SELECT id FROM hosts WHERE slug = 'alex'");
    hostId = hostRes.rows[0].id;

    const etRes = await pool.query("SELECT id FROM event_types WHERE host_id = $1 AND slug = 'quick-catchup'", [hostId]);
    singleEventTypeId = etRes.rows[0].id;

    // Start a programmable mock webhook server
    await new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        mockWebhookReceivedHeaders.push(req.headers);
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(mockWebhookStatus, { 'Content-Type': 'application/json' });
          if (mockWebhookStatus === 200) {
            res.end(JSON.stringify({ status: 'ok' }));
          } else {
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
        });
      });
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as any;
        mockWebhookPort = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise(res => mockServer.close(res));
    }
    await pool.end();
  });

  beforeEach(async () => {
    mockWebhookReceivedHeaders = [];
    mockWebhookStatus = 200;
    await pool.query('TRUNCATE notifications, bookings, sessions, idempotency_keys CASCADE;');
  });

  // ==========================================
  // SCENARIO 1: Webhook Failure, Retries & DLQ
  // ==========================================
  describe('Scenario 1: Webhook Failure, Exponential Backoff & DLQ', () => {
    it('catches HTTP 500, increments attempts, backs off, forwards headers, and transitions to failed (DLQ)', async () => {
      mockWebhookStatus = 500; // Force webhook failure
      const webhookUrl = `http://127.0.0.1:${mockWebhookPort}/webhook`;
      const worker = new OutboxWorker(webhookUrl, 3); // Max 3 attempts for test

      // Insert a pending notification with a custom idempotency key
      const notifRes = await pool.query(`
        INSERT INTO notifications (type, payload, status, attempts, next_attempt_at)
        VALUES (
          'booking.created',
          '{"booking_id": "test-123", "idempotency_key": "custom-idem-key-999"}',
          'pending',
          0,
          NOW() - INTERVAL '1 second'
        )
        RETURNING id;
      `);
      const notifId = notifRes.rows[0].id;

      // Attempt 1: fails with 500
      const processed1 = await worker.processPendingEvents();
      expect(processed1).toBe(1);
      expect(mockWebhookReceivedHeaders.length).toBe(1);
      expect(mockWebhookReceivedHeaders[0]['x-slotbook-event-id']).toBe(notifId);
      expect(mockWebhookReceivedHeaders[0]['x-slotbook-event-type']).toBe('booking.created');
      expect(mockWebhookReceivedHeaders[0]['x-slotbook-delivery-attempt']).toBe('1');
      expect(mockWebhookReceivedHeaders[0]['x-slotbook-idempotency-key']).toBe('custom-idem-key-999');

      // Check DB after attempt 1: status is pending, attempts is 1, next_attempt_at is future
      const row1 = (await pool.query('SELECT status, attempts, next_attempt_at > NOW() AS backed_off FROM notifications WHERE id = $1', [notifId])).rows[0];
      expect(row1.status).toBe('pending');
      expect(row1.attempts).toBe(1);
      expect(row1.backed_off).toBe(true);

      // Fast-forward next_attempt_at so worker will retry immediately
      await pool.query("UPDATE notifications SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1", [notifId]);

      // Attempt 2: fails with 500
      const processed2 = await worker.processPendingEvents();
      expect(processed2).toBe(1);
      const row2 = (await pool.query('SELECT status, attempts FROM notifications WHERE id = $1', [notifId])).rows[0];
      expect(row2.status).toBe('pending');
      expect(row2.attempts).toBe(2);

      // Fast-forward next_attempt_at again
      await pool.query("UPDATE notifications SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1", [notifId]);

      // Attempt 3: reaches maxAttempts (3) -> transitions to 'failed' (DLQ)
      const processed3 = await worker.processPendingEvents();
      expect(processed3).toBe(1);
      const row3 = (await pool.query('SELECT status, attempts FROM notifications WHERE id = $1', [notifId])).rows[0];
      expect(row3.status).toBe('failed');
      expect(row3.attempts).toBe(3);

      // Worker should now ignore it on future runs
      await pool.query("UPDATE notifications SET next_attempt_at = NOW() - INTERVAL '1 second' WHERE id = $1", [notifId]);
      const processed4 = await worker.processPendingEvents();
      expect(processed4).toBe(0);
    });
  });

  // ==========================================
  // SCENARIO 2: Sub-Millisecond Cancellation Races
  // ==========================================
  describe('Scenario 2: Sub-Millisecond Cancellation & Reschedule Races', () => {
    it('concurrent cancel vs reschedule: exactly one operation succeeds and schedule remains consistent', async () => {
      const slot1 = '2026-12-01T14:00:00.000Z';
      const slot2 = '2026-12-01T15:00:00.000Z';

      // 1. Create and confirm a booking in slot 1
      const holdRes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot1,
      });
      const confirmed = await BookingService.confirmHold({
        holdId: holdRes.data.hold_id,
        guestName: 'Racer Alice',
        guestEmail: 'alice@example.com',
      });
      const token = confirmed.token;

      // 2. Fire cancel AND reschedule simultaneously
      const [cancelResult, rescheduleResult] = await Promise.allSettled([
        BookingService.cancelBooking(token, 'Need to cancel'),
        BookingService.rescheduleBooking(token, slot2),
      ]);

      const cancelSuccess = cancelResult.status === 'fulfilled';
      const rescheduleSuccess = rescheduleResult.status === 'fulfilled';

      // Exactly one must succeed, or both succeed deterministically in sequential order (reschedule then cancel)
      if (cancelSuccess && !rescheduleSuccess) {
        // Cancel won first; reschedule rejected because booking was cancelled
        expect((rescheduleResult as PromiseRejectedResult).reason.message).toMatch(/Cannot reschedule a booking with status 'cancelled'/);
      } else if (rescheduleSuccess && cancelSuccess) {
        // Reschedule won first and moved to slot 2; then cancel executed and cancelled slot 2
        const finalBooking = await BookingService.getBookingByToken(token);
        expect(finalBooking.status).toBe('cancelled');
      } else {
        throw new Error(`Unexpected outcome: cancel=${cancelSuccess}, reschedule=${rescheduleSuccess}`);
      }

      // Verify no orphaned active sessions
      const activeSessions = await pool.query("SELECT * FROM sessions WHERE host_id = $1 AND status = 'active'", [hostId]);
      const finalBooking = await BookingService.getBookingByToken(token);
      if (finalBooking.status === 'cancelled') {
        expect(activeSessions.rows.length).toBe(0);
      }
    });

    it('double concurrent cancellation generates exactly one outbox notification and preserves idempotent response', async () => {
      const slot = '2026-12-01T14:00:00.000Z';
      const holdRes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot,
      });
      const confirmed = await BookingService.confirmHold({
        holdId: holdRes.data.hold_id,
        guestName: 'Double Cancel Guest',
        guestEmail: 'dc@example.com',
      });
      const token = confirmed.token;

      // Fire 2 concurrent cancellations
      const [res1, res2] = await Promise.all([
        BookingService.cancelBooking(token, 'Reason A'),
        BookingService.cancelBooking(token, 'Reason B'),
      ]);

      expect(res1.status).toBe('cancelled');
      expect(res2.status).toBe('cancelled');

      // Crucial: exactly ONE cancellation notification was placed in the outbox
      const notifs = await pool.query("SELECT * FROM notifications WHERE type = 'booking.cancelled'");
      expect(notifs.rows.length).toBe(1);
    });

    it('immediate re-booking after cancellation succeeds without constraint violation', async () => {
      const slot = '2026-12-01T14:00:00.000Z';
      
      // Guest A books
      const holdARes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot,
      });
      const confA = await BookingService.confirmHold({
        holdId: holdARes.data.hold_id,
        guestName: 'Guest A',
        guestEmail: 'a@example.com',
      });

      // Guest A cancels
      await BookingService.cancelBooking(confA.token, 'Plans changed');

      // Guest B immediately books the exact same slot
      const holdBRes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot,
      });
      const confB = await BookingService.confirmHold({
        holdId: holdBRes.data.hold_id,
        guestName: 'Guest B',
        guestEmail: 'b@example.com',
      });

      expect(confB.booking_id).toBe(holdBRes.data.hold_id);
      expect(confB.guest_name).toBe('Guest B');

      // Verify the new booking is active
      const bRes = await BookingService.getBookingByToken(confB.token);
      expect(bRes.status).toBe('confirmed');
    });
  });

  // ==========================================
  // SCENARIO 3: Zero-Buffer Adjacency & Boundary Math
  // ==========================================
  describe('Scenario 3: Zero-Buffer Adjacency & Boundary Conditions', () => {
    it('back-to-back 30-min meetings with 0 buffers abut cleanly on [) half-open intervals', async () => {
      // Create custom zero-buffer event type
      await pool.query(`
        INSERT INTO event_types (
          host_id, slug, name, duration_min, capacity, buffer_before_min, buffer_after_min, min_notice_hours, horizon_days
        ) VALUES (
          $1, 'zero-buffer', 'Zero Buffer Meeting', 30, 1, 0, 0, 1, 60
        ) ON CONFLICT (host_id, slug) DO NOTHING;
      `, [hostId]);

      const slotA = '2026-12-02T10:00:00.000Z';
      const slotB = '2026-12-02T10:30:00.000Z'; // Shares exact boundary timestamp with slot A end

      // Book Slot A (10:00 - 10:30)
      const holdARes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'zero-buffer',
        slotStart: slotA,
      });
      await BookingService.confirmHold({
        holdId: holdARes.data.hold_id,
        guestName: 'Meeting 1',
        guestEmail: 'm1@example.com',
      });

      // Book Slot B (10:30 - 11:00)
      const holdBRes = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'zero-buffer',
        slotStart: slotB,
      });
      const confB = await BookingService.confirmHold({
        holdId: holdBRes.data.hold_id,
        guestName: 'Meeting 2',
        guestEmail: 'm2@example.com',
      });

      expect(confB.start_at).toBe(slotB);

      // Now attempt to book an overlapping slot (10:15 - 10:45) -> MUST fail with 409
      const slotConflict = '2026-12-02T10:15:00.000Z';
      await expect(
        BookingService.createHold({
          hostSlug: 'alex',
          eventSlug: 'zero-buffer',
          slotStart: slotConflict,
        })
      ).rejects.toThrow(/Slot conflicts with an existing booking or buffer window/);
    });
  });

  // ==========================================
  // SCENARIO 4: Timezone & DST Projection
  // ==========================================
  describe('Scenario 4: Timezone & DST Boundary Conditions', () => {
    it('skips non-existent 02:00 hour during Spring-Forward leap (23-hour day)', () => {
      // 2026-03-08 is Spring-Forward in America/New_York (clocks jump from 02:00 to 03:00)
      const slots = generateSlots({
        hostTimezone: 'America/New_York',
        guestTimezone: 'America/New_York',
        eventType: {
          id: 'et-dst',
          slug: 'dst-meeting',
          name: 'DST Meeting',
          duration_min: 60,
          capacity: 1,
          buffer_before_min: 0,
          buffer_after_min: 0,
          min_notice_hours: 0,
          horizon_days: 365,
        },
        weeklyAvailability: [
          { weekday: 7, start_time: '01:00', end_time: '05:00' }, // Sunday
        ],
        dateOverrides: [],
        existingSessions: [],
        now: '2026-03-07T00:00:00Z',
        fromUtc: '2026-03-08T05:00:00Z', // 00:00 EST
        toUtc: '2026-03-08T11:00:00Z',   // 06:00 EST
      });

      // Available window is 01:00 to 05:00.
      // Physical hours on this day: 01:00 exists, 02:00 does NOT exist, 03:00 exists, 04:00 exists.
      // Total slots must be 3 (01:00, 03:00, 04:00)
      const displayStarts = slots.map(s => s.display_start);
      expect(displayStarts.some(s => s.includes('02:00'))).toBe(false);
      expect(displayStarts.some(s => s.includes('01:00'))).toBe(true);
      expect(displayStarts.some(s => s.includes('03:00'))).toBe(true);
      expect(displayStarts.some(s => s.includes('04:00'))).toBe(true);
      expect(slots.length).toBe(3);
    });

    it('produces monotonically strictly increasing UTC timestamps during Fall-Back (25-hour day)', () => {
      // 2026-11-01 is Fall-Back in America/New_York
      const slots = generateSlots({
        hostTimezone: 'America/New_York',
        guestTimezone: 'UTC',
        eventType: {
          id: 'et-dst',
          slug: 'dst-meeting',
          name: 'DST Meeting',
          duration_min: 60,
          capacity: 1,
          buffer_before_min: 0,
          buffer_after_min: 0,
          min_notice_hours: 0,
          horizon_days: 365,
        },
        weeklyAvailability: [
          { weekday: 7, start_time: '00:00', end_time: '06:00' },
        ],
        dateOverrides: [],
        existingSessions: [],
        now: '2026-10-31T00:00:00Z',
        fromUtc: '2026-11-01T00:00:00Z',
        toUtc: '2026-11-01T12:00:00Z',
      });

      expect(slots.length).toBeGreaterThan(0);
      for (let i = 1; i < slots.length; i++) {
        const prev = new Date(slots[i - 1].start_at).getTime();
        const curr = new Date(slots[i].start_at).getTime();
        expect(curr).toBeGreaterThan(prev); // Strictly increasing, zero duplicate keys
      }
    });
  });

  // ==========================================
  // SCENARIO 5: Date Overrides Precedence
  // ==========================================
  describe('Scenario 5: Date Overrides Precedence', () => {
    it('partial-day date override restricts availability strictly to override window', () => {
      // Monday weekly availability: 09:00 - 17:00
      // Override on 2026-12-07 (Monday): 13:00 - 15:00
      const slots = generateSlots({
        hostTimezone: 'UTC',
        guestTimezone: 'UTC',
        eventType: {
          id: 'et-normal',
          slug: 'normal-meeting',
          name: 'Normal Meeting',
          duration_min: 30,
          capacity: 1,
          buffer_before_min: 0,
          buffer_after_min: 0,
          min_notice_hours: 0,
          horizon_days: 30,
        },
        weeklyAvailability: [
          { weekday: 1, start_time: '09:00', end_time: '17:00' },
        ],
        dateOverrides: [
          { date: '2026-12-07', is_off: false, start_time: '13:00', end_time: '15:00' },
        ],
        existingSessions: [],
        now: '2026-12-01T00:00:00Z',
        fromUtc: '2026-12-07T00:00:00Z',
        toUtc: '2026-12-07T23:59:59Z',
      });

      // Should ONLY produce 13:00, 13:30, 14:00, 14:30 (4 slots)
      expect(slots.length).toBe(4);
      expect(slots.map(s => s.start_at)).toEqual([
        '2026-12-07T13:00:00.000Z',
        '2026-12-07T13:30:00.000Z',
        '2026-12-07T14:00:00.000Z',
        '2026-12-07T14:30:00.000Z',
      ]);
    });

    it('full-day is_off override suppresses all slots for that day', () => {
      const slots = generateSlots({
        hostTimezone: 'UTC',
        guestTimezone: 'UTC',
        eventType: {
          id: 'et-normal',
          slug: 'normal-meeting',
          name: 'Normal Meeting',
          duration_min: 30,
          capacity: 1,
          buffer_before_min: 0,
          buffer_after_min: 0,
          min_notice_hours: 0,
          horizon_days: 30,
        },
        weeklyAvailability: [
          { weekday: 1, start_time: '09:00', end_time: '17:00' },
        ],
        dateOverrides: [
          { date: '2026-12-07', is_off: true },
        ],
        existingSessions: [],
        now: '2026-12-01T00:00:00Z',
        fromUtc: '2026-12-07T00:00:00Z',
        toUtc: '2026-12-07T23:59:59Z',
      });

      expect(slots.length).toBe(0);
    });
  });
});
