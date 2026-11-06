import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { pool, withTransaction } from '../config/db.js';
import { BookingService, BookingError } from '../services/BookingService.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../seeds/seed.js';
import { DateTime } from 'luxon';

describe('Slotbook Reliability Test Suite (PRD R1 - R14)', () => {
  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM notifications;');
    await pool.query('DELETE FROM bookings;');
    await pool.query('DELETE FROM sessions;');
    await pool.query('DELETE FROM idempotency_keys;');
  });

  afterAll(async () => {
    await pool.end();
  });

  function getFutureSlot(daysAhead = 5, hour = 10, minute = 0): string {
    return DateTime.utc()
      .plus({ days: daysAhead })
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toISO()!;
  }

  // R1: 50 concurrent holds on one capacity-1 slot: exactly 1 succeeds
  it('R1: 50 concurrent holds on one capacity-1 slot: exactly 1 succeeds', async () => {
    const slotStart = getFutureSlot(4, 10, 0);

    const racers = Array.from({ length: 50 }, (_, i) => ({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart,
      idempotencyKey: `r1-racer-${i}-${Date.now()}`,
    }));

    const results = await Promise.allSettled(
      racers.map(r => BookingService.createHold(r))
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(49);

    for (const rej of rejected) {
      const err = (rej as PromiseRejectedResult).reason;
      expect(err).toBeInstanceOf(BookingError);
      expect(err.statusCode).toBe(409);
    }

    const countRes = await pool.query(`
      SELECT COUNT(*) AS c 
      FROM bookings b 
      JOIN sessions s ON b.session_id = s.id
      WHERE s.start_at = $1 AND b.status = 'held'
    `, [slotStart]);
    expect(parseInt(countRes.rows[0].c, 10)).toBe(1);
  });

  // R2: Capacity 3 with 20 racers: exactly 3 succeed
  it('R2: Capacity 3 with 20 racers: exactly 3 succeed', async () => {
    const slotStart = getFutureSlot(5, 14, 0);

    const racers = Array.from({ length: 20 }, (_, i) => ({
      hostSlug: 'alex',
      eventSlug: 'group-workshop',
      slotStart,
      idempotencyKey: `r2-racer-${i}-${Date.now()}`,
    }));

    const results = await Promise.allSettled(
      racers.map(r => BookingService.createHold(r))
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(3);
    expect(rejected.length).toBe(17);

    for (const rej of rejected) {
      const err = (rej as PromiseRejectedResult).reason;
      expect(err.statusCode).toBe(409);
    }

    const sessRes = await pool.query(`
      SELECT s.id, COUNT(b.id) AS active_holds
      FROM sessions s
      JOIN bookings b ON s.id = b.session_id
      WHERE s.start_at = $1 AND b.status = 'held'
      GROUP BY s.id
    `, [slotStart]);
    expect(sessRes.rows.length).toBe(1);
    expect(parseInt(sessRes.rows[0].active_holds, 10)).toBe(3);
  });

  // R3: Overlapping slots from different event types of one host
  it('R3: Overlapping slots from different event types (including buffers) never both book', async () => {
    const slot1 = getFutureSlot(6, 11, 0);
    const slot2 = getFutureSlot(6, 11, 30);

    const [res1, res2] = await Promise.allSettled([
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot1,
        idempotencyKey: `r3-1-${Date.now()}`,
      }),
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'group-workshop',
        slotStart: slot2,
        idempotencyKey: `r3-2-${Date.now()}`,
      }),
    ]);

    const successes = [res1, res2].filter(r => r.status === 'fulfilled');
    const failures = [res1, res2].filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });

  // R4: 10 parallel hold requests with the same Idempotency-Key
  it('R4: 10 parallel hold requests with same Idempotency-Key produce 1 hold & identical responses', async () => {
    const slotStart = getFutureSlot(7, 10, 0);
    const key = `idem-key-test-${Date.now()}`;

    const requests = Array.from({ length: 10 }, () =>
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart,
        idempotencyKey: key,
      })
    );

    const responses = await Promise.all(requests);
    expect(responses.length).toBe(10);

    const firstHoldId = responses[0].data.hold_id;
    for (const resp of responses) {
      expect(resp.data.hold_id).toBe(firstHoldId);
      expect(resp.statusCode).toBe(201);
    }

    const dbRes = await pool.query('SELECT COUNT(*) AS c FROM bookings WHERE id = $1', [firstHoldId]);
    expect(parseInt(dbRes.rows[0].c, 10)).toBe(1);
  });

  // R5: Same key with a different body returns 422
  it('R5: Same key with a different body returns 422', async () => {
    const key = `idem-key-diff-body-${Date.now()}`;
    const slot1 = getFutureSlot(8, 10, 0);
    const slot2 = getFutureSlot(8, 11, 0);

    const first = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot1,
      idempotencyKey: key,
    });
    expect(first.statusCode).toBe(201);

    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot2,
        idempotencyKey: key,
      })
    ).rejects.toThrowError(
      expect.objectContaining({ statusCode: 422, code: 'IDEMPOTENCY_MISMATCH' })
    );
  });

  // R6: Confirm after expiry returns 410 and the slot becomes bookable again
  it('R6: Confirm after expiry returns 410 and slot becomes bookable again', async () => {
    const slotStart = getFutureSlot(9, 10, 0);

    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart,
    });

    await pool.query(`
      UPDATE bookings 
      SET hold_expires_at = NOW() - INTERVAL '10 seconds'
      WHERE id = $1
    `, [hold.data.hold_id]);

    await expect(
      BookingService.confirmHold({
        holdId: hold.data.hold_id,
        guestName: 'Late Guest',
        guestEmail: 'late@example.com',
      })
    ).rejects.toThrowError(
      expect.objectContaining({ statusCode: 410, code: 'HOLD_EXPIRED' })
    );

    const newHold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart,
    });
    expect(newHold.statusCode).toBe(201);
  });

  // R7: Confirm racing the expiry boundary
  it('R7: Confirm racing the expiry boundary resolves to exactly one outcome', async () => {
    const slotStart = getFutureSlot(10, 10, 0);
    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart,
    });

    await pool.query(`
      UPDATE bookings 
      SET hold_expires_at = NOW() + INTERVAL '100 milliseconds'
      WHERE id = $1
    `, [hold.data.hold_id]);

    await new Promise(r => setTimeout(r, 90));

    try {
      const confirmed = await BookingService.confirmHold({
        holdId: hold.data.hold_id,
        guestName: 'Boundary Racer',
        guestEmail: 'racer@example.com',
      });
      expect(confirmed.token).toBeDefined();
    } catch (err: any) {
      expect(err.statusCode).toBe(410);
    }
  });

  // R8: Reschedule into a taken slot fails and leaves original booking intact
  it('R8: Reschedule into a taken slot fails and leaves original booking intact', async () => {
    const slotA = getFutureSlot(11, 10, 0);
    const slotB = getFutureSlot(11, 11, 0);

    const holdA = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart: slotA });
    const confirmA = await BookingService.confirmHold({ holdId: holdA.data.hold_id, guestName: 'Guest A', guestEmail: 'a@example.com' });

    const holdB = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart: slotB });
    await BookingService.confirmHold({ holdId: holdB.data.hold_id, guestName: 'Guest B', guestEmail: 'b@example.com' });

    await expect(
      BookingService.rescheduleBooking(confirmA.token, slotB)
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 409 }));

    const currentA = await BookingService.getBookingByToken(confirmA.token);
    expect(currentA.status).toBe('confirmed');
    expect(new Date(currentA.start_at).toISOString()).toBe(slotA);
  });

  // R9: Concurrent reschedules into one free slot: one winner
  it('R9: Concurrent reschedules into one free slot: exactly one winner', async () => {
    const slot1 = getFutureSlot(12, 10, 0);
    const slot2 = getFutureSlot(12, 11, 0);
    const targetSlot = getFutureSlot(12, 14, 0);

    const h1 = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart: slot1 });
    const c1 = await BookingService.confirmHold({ holdId: h1.data.hold_id, guestName: 'Racer 1', guestEmail: 'r1@test.com' });

    const h2 = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart: slot2 });
    const c2 = await BookingService.confirmHold({ holdId: h2.data.hold_id, guestName: 'Racer 2', guestEmail: 'r2@test.com' });

    const results = await Promise.allSettled([
      BookingService.rescheduleBooking(c1.token, targetSlot),
      BookingService.rescheduleBooking(c2.token, targetSlot),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const b1 = await BookingService.getBookingByToken(c1.token);
    const b2 = await BookingService.getBookingByToken(c2.token);

    const starts = [new Date(b1.start_at).toISOString(), new Date(b2.start_at).toISOString()];
    expect(starts).toContain(targetSlot);
  });

  // R10: Raw SQL insert that overlaps an active session is rejected by GiST
  it('R10: Raw SQL insert that overlaps an active session is rejected by GiST exclusion constraint', async () => {
    const slot = getFutureSlot(13, 10, 0);
    const slotDt = DateTime.fromISO(slot);
    const blockedStart = slotDt.minus({ minutes: 15 }).toISO()!;
    const blockedEnd = slotDt.plus({ minutes: 45 }).toISO()!;

    const hostRes = await pool.query("SELECT id FROM hosts WHERE slug = 'alex'");
    const hostId = hostRes.rows[0].id;

    const eventRes = await pool.query("SELECT id FROM event_types WHERE host_id = $1 LIMIT 1", [hostId]);
    const eventId = eventRes.rows[0].id;

    await pool.query(`
      INSERT INTO sessions (host_id, event_type_id, start_at, end_at, blocked_range, capacity, status)
      VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), 1, 'active')
    `, [hostId, eventId, slot, slotDt.plus({ minutes: 30 }).toISO()!, blockedStart, blockedEnd]);

    let caughtCode = '';
    try {
      await pool.query(`
        INSERT INTO sessions (host_id, event_type_id, start_at, end_at, blocked_range, capacity, status)
        VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), 1, 'active')
      `, [hostId, eventId, slot, slotDt.plus({ minutes: 30 }).toISO()!, blockedStart, blockedEnd]);
    } catch (err: any) {
      caughtCode = err.code;
    }

    expect(caughtCode).toBe('23P01');
  });

  // R11: Crash or error mid-operation leaves no partial state
  it('R11: Crash or error mid-operation triggers complete rollback with zero partial state', async () => {
    const slotStart = getFutureSlot(14, 10, 0);

    let errorThrown = false;
    try {
      await withTransaction(async (client) => {
        const sess = await client.query(`
          INSERT INTO sessions (host_id, event_type_id, start_at, end_at, blocked_range, capacity, status)
          SELECT id, (SELECT id FROM event_types WHERE host_id = hosts.id LIMIT 1),
                 $1, $1::timestamptz + interval '30 minutes',
                 tstzrange($1::timestamptz, $1::timestamptz + interval '45 minutes', '[)'), 1, 'active'
          FROM hosts WHERE slug = 'alex'
          RETURNING id;
        `, [slotStart]);

        await client.query(`
          INSERT INTO bookings (session_id, status, hold_expires_at)
          VALUES ($1, 'held', NOW() + interval '5 minutes')
        `, [sess.rows[0].id]);

        throw new Error('SIMULATED_SERVER_CRASH_MID_OPERATION');
      });
    } catch (err: any) {
      if (err.message === 'SIMULATED_SERVER_CRASH_MID_OPERATION') {
        errorThrown = true;
      }
    }

    expect(errorThrown).toBe(true);

    const checkRes = await pool.query(`
      SELECT COUNT(*) AS c FROM sessions WHERE start_at = $1
    `, [slotStart]);
    expect(parseInt(checkRes.rows[0].c, 10)).toBe(0);
  });

  // R12: Outbox stores events reliably
  it('R12: Outbox stores events reliably and retains pending status for recovery', async () => {
    const slot = getFutureSlot(15, 10, 0);

    const hold = await BookingService.createHold({ hostSlug: 'alex', eventSlug: 'quick-catchup', slotStart: slot });
    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Outbox Tester',
      guestEmail: 'outbox@example.com',
    });

    const notifRes = await pool.query(`
      SELECT * FROM notifications 
      WHERE type = 'booking.confirmed' AND payload->>'booking_id' = $1
    `, [confirmed.booking_id]);

    expect(notifRes.rows.length).toBe(1);
    expect(notifRes.rows[0].status).toBe('pending');
    expect(notifRes.rows[0].attempts).toBe(0);
  });

  // R13: Input validation
  it('R13: Input validation rejects past time, off-grid time, and notice/horizon violations', async () => {
    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: '2020-01-01T10:00:00.000Z',
      })
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 400, code: 'SLOT_IN_PAST' }));

    const offGrid = getFutureSlot(16, 10, 7);
    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: offGrid,
      })
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 400, code: 'OFF_GRID_SLOT' }));

    const tooSoon = DateTime.utc().plus({ minutes: 30 }).set({ second: 0, millisecond: 0 }).toISO()!;
    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: tooSoon,
      })
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 400, code: 'MIN_NOTICE_VIOLATION' }));

    const tooFar = getFutureSlot(45, 10, 0);
    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: tooFar,
      })
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 400, code: 'HORIZON_VIOLATION' }));
  });

  // R14: Invariants hold even when no background sweeper is running
  it('R14: Invariants hold even when no background sweeper is running', async () => {
    const slot = getFutureSlot(17, 10, 0);

    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
    });

    await expect(
      BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot,
      })
    ).rejects.toThrowError(expect.objectContaining({ statusCode: 409 }));

    await pool.query(`
      UPDATE bookings 
      SET hold_expires_at = NOW() - interval '1 second'
      WHERE id = $1
    `, [hold.data.hold_id]);

    const nextHold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
    });
    expect(nextHold.statusCode).toBe(201);
  });
});

