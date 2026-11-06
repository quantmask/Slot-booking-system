import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../config/db.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../seeds/seed.js';
import { BookingService } from '../services/BookingService.js';
import { generateSlots } from '../lib/slot_engine.js';
import { buildServer } from '../server.js';
import { DateTime } from 'luxon';

describe('Slotbook Optional Extensions Test Suite', () => {
  let app: any;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    await pool.query('DELETE FROM notifications;');
    await pool.query('DELETE FROM bookings;');
    await pool.query('DELETE FROM sessions;');
    await pool.query('DELETE FROM idempotency_keys;');
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Extension 1: Daily booking cap prevents booking beyond configured limit', async () => {
    const slot1 = DateTime.utc().plus({ days: 20 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 }).toISO()!;
    const slot2 = DateTime.utc().plus({ days: 20 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    try {
      // Set daily cap of 1 on event type 'quick-catchup'
      await pool.query(`UPDATE event_types SET daily_booking_cap = 1 WHERE slug = 'quick-catchup'`);

      // First hold & confirm succeeds
      const hold1 = await BookingService.createHold({
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: slot1,
      });
      expect(hold1.statusCode).toBe(201);

      await BookingService.confirmHold({
        holdId: hold1.data.hold_id,
        guestName: 'Cap Tester 1',
        guestEmail: 'cap1@test.com',
      });

      // Second hold on same day must be rejected with 409 DAILY_CAP_REACHED
      await expect(
        BookingService.createHold({
          hostSlug: 'alex',
          eventSlug: 'quick-catchup',
          slotStart: slot2,
        })
      ).rejects.toThrow(/Daily booking cap/);
    } finally {
      await pool.query(`UPDATE event_types SET daily_booking_cap = NULL WHERE slug = 'quick-catchup'`);
    }
  });

  it('Extension 2: Per-guest active booking limit prevents multiple concurrent bookings per event type', async () => {
    const slotA = DateTime.utc().plus({ days: 21 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 }).toISO()!;
    const slotB = DateTime.utc().plus({ days: 22 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const holdA = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slotA,
    });
    await BookingService.confirmHold({
      holdId: holdA.data.hold_id,
      guestName: 'Duplicate Guest',
      guestEmail: 'duplicate.guest@example.com',
    });

    const holdB = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slotB,
    });

    // Confirming second booking for same email must be rejected with 409 PER_GUEST_LIMIT_EXCEEDED
    await expect(
      BookingService.confirmHold({
        holdId: holdB.data.hold_id,
        guestName: 'Duplicate Guest',
        guestEmail: 'duplicate.guest@example.com',
      })
    ).rejects.toThrow(/Guest already holds an active booking/);
  });

  it('Extension 3: External busy times eliminate overlapping slots', async () => {
    let testDay = DateTime.utc().plus({ days: 23 }).startOf('day');
    while (testDay.weekday > 5) {
      testDay = testDay.plus({ days: 1 });
    }

    const hostRes = await pool.query("SELECT * FROM hosts WHERE slug = 'alex'");
    const host = hostRes.rows[0];

    const eventRes = await pool.query("SELECT * FROM event_types WHERE slug = 'quick-catchup'");
    const eventType = eventRes.rows[0];

    const weeklyRes = await pool.query('SELECT weekday, start_time::text, end_time::text FROM weekly_availability WHERE host_id = $1', [host.id]);

    const normalSlots = generateSlots({
      hostTimezone: host.timezone,
      guestTimezone: host.timezone,
      eventType,
      weeklyAvailability: weeklyRes.rows,
      dateOverrides: [],
      existingSessions: [],
      fromUtc: testDay.toISO()!,
      toUtc: testDay.plus({ days: 1 }).toISO()!,
    });

    expect(normalSlots.length).toBeGreaterThan(0);
    const targetSlot = normalSlots[0];
    const busyStart = new Date(targetSlot.start_at);
    const busyEnd = new Date(targetSlot.end_at);

    const blockedSlots = generateSlots({
      hostTimezone: host.timezone,
      guestTimezone: host.timezone,
      eventType,
      weeklyAvailability: weeklyRes.rows,
      dateOverrides: [],
      existingSessions: [],
      externalBusyTimes: [{ start_at: busyStart, end_at: busyEnd, title: 'Dental Appointment' }],
      fromUtc: testDay.toISO()!,
      toUtc: testDay.plus({ days: 1 }).toISO()!,
    });

    expect(blockedSlots.length).toBeLessThan(normalSlots.length);
    const isTargetStillPresent = blockedSlots.some(s => s.start_at === targetSlot.start_at);
    expect(isTargetStillPresent).toBe(false);
  });

  it('Extension 4: Waitlist promotes waiting guest on cancellation', async () => {
    const slot = DateTime.utc().plus({ days: 24 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    // 1. Hold and confirm slot
    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
    });

    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Original Guest',
      guestEmail: 'original@example.com',
    });

    // 2. Join waitlist for this slot
    const waitlist = await BookingService.joinWaitlist({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
      guestName: 'Waitlisted Guest',
      guestEmail: 'waitlisted@example.com',
    });
    expect(waitlist.status).toBe('waitlisted');
    expect(waitlist.position).toBeGreaterThanOrEqual(1);

    // 3. Cancel original booking
    await BookingService.cancelBooking(confirmed.token, 'Cannot attend');

    // 4. Verify waitlist entry was promoted to 'offered'
    const updatedWait = await pool.query('SELECT * FROM waitlists WHERE id = $1', [waitlist.waitlist_id]);
    expect(updatedWait.rows[0].status).toBe('offered');
    expect(updatedWait.rows[0].hold_id).toBeTruthy();

    const offeredHold = await pool.query('SELECT * FROM bookings WHERE id = $1', [updatedWait.rows[0].hold_id]);
    expect(offeredHold.rows[0].status).toBe('held');
  });

  it('Extension 5: Reminders are scheduled on confirm and cancelled on cancellation', async () => {
    const slot = DateTime.utc().plus({ days: 25 }).set({ hour: 15, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
    });

    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Reminder Guest',
      guestEmail: 'remindme@example.com',
    });

    const rems = await pool.query('SELECT * FROM reminders WHERE booking_id = $1', [confirmed.booking_id]);
    expect(rems.rows.length).toBeGreaterThanOrEqual(1);
    expect(rems.rows.some(r => r.reminder_type === '24h')).toBe(true);

    await BookingService.cancelBooking(confirmed.token, 'Trip cancelled');

    const cancelledRems = await pool.query('SELECT * FROM reminders WHERE booking_id = $1', [confirmed.booking_id]);
    expect(cancelledRems.rows.every(r => r.status === 'cancelled')).toBe(true);
  });

  it('Extension 6: Direct .ics file download returns valid RFC 5545 payload', async () => {
    const slot = DateTime.utc().plus({ days: 26 }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const hold = await BookingService.createHold({
      hostSlug: 'alex',
      eventSlug: 'quick-catchup',
      slotStart: slot,
    });

    const confirmed = await BookingService.confirmHold({
      holdId: hold.data.hold_id,
      guestName: 'Calendar Guest',
      guestEmail: 'cal@example.com',
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/bookings/${confirmed.token}/ics`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).toContain('BEGIN:VEVENT');
    expect(res.body).toContain('STATUS:CONFIRMED');
    expect(res.body).toContain('END:VCALENDAR');
  });

  it('Extension 7: Observability /health endpoint exposes complete telemetry metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body.metrics).toHaveProperty('total_bookings');
    expect(body.metrics).toHaveProperty('confirmed_bookings');
    expect(body.metrics).toHaveProperty('active_holds');
    expect(body.metrics).toHaveProperty('hold_expiries');
    expect(body.metrics).toHaveProperty('pending_notifications');
    expect(body.metrics).toHaveProperty('notification_lag_ms');
    expect(body.metrics).toHaveProperty('active_waitlists');
  });

  it('Extension 8: Rate limit headers are injected on public routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/quick-catchup/slots',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeTruthy();
    expect(res.headers['x-ratelimit-remaining']).toBeTruthy();
  });
});
