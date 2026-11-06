import { pool, withTransaction } from '../config/db.js';
import { generateSecureToken, hashToken, computePayloadHash } from '../lib/security.js';
import { notifySlotsChanged } from '../lib/eventBus.js';
import { DateTime } from 'luxon';

export class BookingError extends Error {
  constructor(message: string, public statusCode: number, public code?: string) {
    super(message);
    this.name = 'BookingError';
  }
}

export interface HoldResult {
  hold_id: string;
  session_id: string;
  start_at: string;
  end_at: string;
  hold_expires_at: string;
  event_name: string;
  host_slug: string;
}

export interface ConfirmResult {
  booking_id: string;
  token: string;
  guest_name: string;
  guest_email: string;
  start_at: string;
  end_at: string;
  event_name: string;
}

export class BookingService {
  /**
   * Create a 5-minute hold on a slot.
   * Serializes per host and checks capacity and buffers.
   */
  static async createHold(params: {
    hostSlug: string;
    eventSlug: string;
    slotStart: string; // ISO UTC string
    idempotencyKey?: string;
  }): Promise<{ statusCode: number; data: HoldResult }> {
    const { hostSlug, eventSlug, slotStart, idempotencyKey } = params;

    const requestPayload = { hostSlug, eventSlug, slotStart };
    const requestHash = computePayloadHash(requestPayload);

    // 1. Check idempotency if key provided
    if (idempotencyKey) {
      const existingKey = await pool.query(
        'SELECT * FROM idempotency_keys WHERE key = $1',
        [idempotencyKey]
      );

      if (existingKey.rows.length > 0) {
        const row = existingKey.rows[0];
        if (row.request_hash !== requestHash) {
          throw new BookingError('Idempotency key reused with different request payload', 422, 'IDEMPOTENCY_MISMATCH');
        }
        return {
          statusCode: row.status_code,
          data: row.response_body,
        };
      }
    }

    // 2. Execute hold in an ACID transaction
    return await withTransaction(async (client) => {
      // Find host
      const hostRes = await client.query(
        'SELECT id, timezone FROM hosts WHERE slug = $1',
        [hostSlug]
      );
      if (hostRes.rows.length === 0) {
        throw new BookingError(`Host '${hostSlug}' not found`, 404, 'HOST_NOT_FOUND');
      }
      const host = hostRes.rows[0];

      // Serialization lock on host
      await client.query('SELECT id FROM hosts WHERE id = $1 FOR UPDATE', [host.id]);

      // Check idempotency again inside lock
      if (idempotencyKey) {
        const lockedKey = await client.query(
          'SELECT * FROM idempotency_keys WHERE key = $1',
          [idempotencyKey]
        );
        if (lockedKey.rows.length > 0) {
          const row = lockedKey.rows[0];
          if (row.request_hash !== requestHash) {
            throw new BookingError('Idempotency key reused with different request payload', 422, 'IDEMPOTENCY_MISMATCH');
          }
          return { statusCode: row.status_code, data: row.response_body };
        }
      }

      // Find event type
      const eventRes = await client.query(`
        SELECT * FROM event_types 
        WHERE host_id = $1 AND slug = $2 AND archived_at IS NULL
      `, [host.id, eventSlug]);

      if (eventRes.rows.length === 0) {
        throw new BookingError(`Event type '${eventSlug}' not found`, 404, 'EVENT_NOT_FOUND');
      }
      const event = eventRes.rows[0];

      // Parse slotStart and validate time boundaries (R13)
      const slotStartDt = DateTime.fromISO(slotStart, { zone: 'utc' });
      if (!slotStartDt.isValid) {
        throw new BookingError('Invalid slotStart ISO timestamp', 400, 'INVALID_SLOT_TIME');
      }

      // Query DB now() for time checks
      const dbNowRes = await client.query('SELECT NOW() AS now');
      const dbNow = DateTime.fromJSDate(dbNowRes.rows[0].now, { zone: 'utc' });

      if (slotStartDt < dbNow) {
        throw new BookingError('Cannot book a slot in the past', 400, 'SLOT_IN_PAST');
      }

      const minNoticeDt = dbNow.plus({ hours: event.min_notice_hours });
      if (slotStartDt < minNoticeDt) {
        throw new BookingError(`Slot violates minimum notice of ${event.min_notice_hours} hours`, 400, 'MIN_NOTICE_VIOLATION');
      }

      const horizonDt = dbNow.plus({ days: event.horizon_days });
      if (slotStartDt > horizonDt) {
        throw new BookingError(`Slot exceeds booking horizon of ${event.horizon_days} days`, 400, 'HORIZON_VIOLATION');
      }

      // Validate on-grid alignment with duration
      const slotMinutes = slotStartDt.minute;
      if (slotMinutes % 15 !== 0) {
        throw new BookingError('Slot start must be aligned to a 15-minute grid', 400, 'OFF_GRID_SLOT');
      }

      const slotEndDt = slotStartDt.plus({ minutes: event.duration_min });
      const blockedStartDt = slotStartDt.minus({ minutes: event.buffer_before_min });
      const blockedEndDt = slotEndDt.plus({ minutes: event.buffer_after_min });

      const slotStartIso = slotStartDt.toISO()!;
      const slotEndIso = slotEndDt.toISO()!;
      const blockedStartIso = blockedStartDt.toISO()!;
      const blockedEndIso = blockedEndDt.toISO()!;

      // Check if an active session already exists for this exact event and time
      const sessionRes = await client.query(`
        SELECT * FROM sessions 
        WHERE event_type_id = $1 AND start_at = $2 AND status = 'active'
        FOR UPDATE
      `, [event.id, slotStartIso]);

      let session = sessionRes.rows[0];

      if (session) {
        // Session exists: check active bookings (confirmed or held and not expired)
        const countRes = await client.query(`
          SELECT COUNT(*) AS active_count FROM bookings
          WHERE session_id = $1 
            AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
        `, [session.id]);

        const activeCount = parseInt(countRes.rows[0].active_count, 10);
        if (activeCount >= session.capacity) {
          throw new BookingError('Slot is fully booked', 409, 'SLOT_FULL');
        }
      } else {
        // Check for buffer / session collisions with other sessions
        const conflictRes = await client.query(`
          SELECT id FROM sessions 
          WHERE host_id = $1 
            AND status = 'active'
            AND blocked_range && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        `, [host.id, blockedStartIso, blockedEndIso]);

        if (conflictRes.rows.length > 0) {
          throw new BookingError('Slot conflicts with an existing booking or buffer window', 409, 'SLOT_CONFLICT');
        }

        // Lazy session creation
        const newSessionRes = await client.query(`
          INSERT INTO sessions (
            host_id, event_type_id, start_at, end_at, blocked_range, capacity, status
          )
          VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), $7, 'active')
          RETURNING *;
        `, [host.id, event.id, slotStartIso, slotEndIso, blockedStartIso, blockedEndIso, event.capacity]);

        session = newSessionRes.rows[0];
      }

      // Insert hold booking with 5-minute TTL based on DB clock
      const holdRes = await client.query(`
        INSERT INTO bookings (session_id, status, hold_expires_at)
        VALUES ($1, 'held', NOW() + INTERVAL '5 minutes')
        RETURNING id, hold_expires_at;
      `, [session.id]);

      const hold = holdRes.rows[0];

      const responseData: HoldResult = {
        hold_id: hold.id,
        session_id: session.id,
        start_at: slotStartIso,
        end_at: slotEndIso,
        hold_expires_at: hold.hold_expires_at.toISOString(),
        event_name: event.name,
        host_slug: hostSlug,
      };

      // Record idempotency key if provided
      if (idempotencyKey) {
        await client.query(`
          INSERT INTO idempotency_keys (key, host_id, request_hash, status_code, response_body)
          VALUES ($1, $2, $3, 201, $4)
        `, [idempotencyKey, host.id, requestHash, JSON.stringify(responseData)]);
      }

      return { statusCode: 201, data: responseData };
    });

    notifySlotsChanged(hostSlug, eventSlug);
    return result;
  }

  /**
   * Confirm a hold with guest details.
   * Returns private manage token once.
   */
  static async confirmHold(params: {
    holdId: string;
    guestName: string;
    guestEmail: string;
  }): Promise<ConfirmResult> {
    const { holdId, guestName, guestEmail } = params;

    if (!guestName || !guestName.trim()) {
      throw new BookingError('Guest name is required', 400, 'INVALID_NAME');
    }
    if (!guestEmail || !guestEmail.includes('@')) {
      throw new BookingError('Valid guest email is required', 400, 'INVALID_EMAIL');
    }

    return await withTransaction(async (client) => {
      // Find booking and lock it
      const bookingRes = await client.query(`
        SELECT b.*, s.host_id, s.start_at, s.end_at, et.name AS event_name
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        JOIN event_types et ON s.event_type_id = et.id
        WHERE b.id = $1
        FOR UPDATE
      `, [holdId]);

      if (bookingRes.rows.length === 0) {
        throw new BookingError('Hold not found', 404, 'HOLD_NOT_FOUND');
      }
      const booking = bookingRes.rows[0];

      // Lock host
      await client.query('SELECT id FROM hosts WHERE id = $1 FOR UPDATE', [booking.host_id]);

      if (booking.status === 'confirmed') {
        throw new BookingError('Hold already confirmed', 400, 'ALREADY_CONFIRMED');
      }
      if (booking.status === 'cancelled') {
        throw new BookingError('Hold has been cancelled', 400, 'ALREADY_CANCELLED');
      }

      // Check DB clock for expiry (R6)
      const nowRes = await client.query('SELECT NOW() AS now');
      const now = new Date(nowRes.rows[0].now).getTime();
      const expiresAt = new Date(booking.hold_expires_at).getTime();

      if (now >= expiresAt) {
        await client.query(`
          UPDATE bookings SET status = 'expired', updated_at = NOW() WHERE id = $1
        `, [holdId]);

        await BookingService.cleanupSessionIfEmpty(client, booking.session_id);
        throw new BookingError('Hold has expired', 410, 'HOLD_EXPIRED');
      }

      const token = generateSecureToken();
      const tokenHash = hashToken(token);

      await client.query(`
        UPDATE bookings
        SET status = 'confirmed',
            guest_name = $1,
            guest_email = $2,
            token_hash = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [guestName.trim(), guestEmail.trim().toLowerCase(), tokenHash, holdId]);

      const notificationPayload = {
        booking_id: holdId,
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim().toLowerCase(),
        event_name: booking.event_name,
        start_at: booking.start_at.toISOString(),
        end_at: booking.end_at.toISOString(),
      };

      await client.query(`
        INSERT INTO notifications (type, payload, status)
        VALUES ('booking.confirmed', $1, 'pending')
      `, [JSON.stringify(notificationPayload)]);

      return {
        booking_id: holdId,
        token,
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim().toLowerCase(),
        start_at: booking.start_at.toISOString(),
        end_at: booking.end_at.toISOString(),
        event_name: booking.event_name,
      };
    });

    notifySlotsChanged();
    return result;
  }

  /**
   * Retrieve booking details via private manage token.
   */
  static async getBookingByToken(token: string) {
    const tokenHash = hashToken(token);
    const res = await pool.query(`
      SELECT b.id, b.status, b.guest_name, b.guest_email, b.cancel_reason, b.created_at,
             s.start_at, s.end_at, s.capacity,
             et.name AS event_name, et.slug AS event_slug, et.duration_min,
             h.slug AS host_slug, h.timezone AS host_timezone
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN event_types et ON s.event_type_id = et.id
      JOIN hosts h ON s.host_id = h.id
      WHERE b.token_hash = $1
    `, [tokenHash]);

    if (res.rows.length === 0) {
      throw new BookingError('Booking not found', 404, 'BOOKING_NOT_FOUND');
    }

    return res.rows[0];
  }

  /**
   * Atomically reschedule a booking to a new slot.
   */
  static async rescheduleBooking(token: string, newSlotStart: string) {
    const tokenHash = hashToken(token);

    return await withTransaction(async (client) => {
      const bRes = await client.query(`
        SELECT b.*, s.host_id, s.event_type_id, s.start_at AS old_start, s.id AS old_session_id,
               et.name AS event_name, et.duration_min, et.capacity, et.buffer_before_min, et.buffer_after_min,
               et.min_notice_hours, et.horizon_days, h.slug AS host_slug
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        JOIN event_types et ON s.event_type_id = et.id
        JOIN hosts h ON s.host_id = h.id
        WHERE b.token_hash = $1
        FOR UPDATE
      `, [tokenHash]);

      if (bRes.rows.length === 0) {
        throw new BookingError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
      const booking = bRes.rows[0];

      if (booking.status !== 'confirmed') {
        throw new BookingError(`Cannot reschedule a booking with status '${booking.status}'`, 400, 'INVALID_STATUS');
      }

      await client.query('SELECT id FROM hosts WHERE id = $1 FOR UPDATE', [booking.host_id]);

      const newStartDt = DateTime.fromISO(newSlotStart, { zone: 'utc' });
      if (!newStartDt.isValid) {
        throw new BookingError('Invalid newSlotStart ISO timestamp', 400, 'INVALID_SLOT_TIME');
      }

      const dbNowRes = await client.query('SELECT NOW() AS now');
      const dbNow = DateTime.fromJSDate(dbNowRes.rows[0].now, { zone: 'utc' });

      if (newStartDt < dbNow) {
        throw new BookingError('Cannot reschedule to a past slot', 400, 'SLOT_IN_PAST');
      }

      const minNoticeDt = dbNow.plus({ hours: booking.min_notice_hours });
      if (newStartDt < minNoticeDt) {
        throw new BookingError(`Slot violates minimum notice of ${booking.min_notice_hours} hours`, 400, 'MIN_NOTICE_VIOLATION');
      }

      const horizonDt = dbNow.plus({ days: booking.horizon_days });
      if (newStartDt > horizonDt) {
        throw new BookingError(`Slot exceeds booking horizon of ${booking.horizon_days} days`, 400, 'HORIZON_VIOLATION');
      }

      if (newStartDt.minute % 15 !== 0) {
        throw new BookingError('Slot start must be aligned to a 15-minute grid', 400, 'OFF_GRID_SLOT');
      }

      const newEndDt = newStartDt.plus({ minutes: booking.duration_min });
      const newBlockedStartDt = newStartDt.minus({ minutes: booking.buffer_before_min });
      const newBlockedEndDt = newEndDt.plus({ minutes: booking.buffer_after_min });

      const newStartIso = newStartDt.toISO()!;
      const newEndIso = newEndDt.toISO()!;
      const newBlockedStartIso = newBlockedStartDt.toISO()!;
      const newBlockedEndIso = newBlockedEndDt.toISO()!;

      const targetSessionRes = await client.query(`
        SELECT * FROM sessions
        WHERE event_type_id = $1 AND start_at = $2 AND status = 'active'
        FOR UPDATE
      `, [booking.event_type_id, newStartIso]);

      let targetSession = targetSessionRes.rows[0];

      if (targetSession) {
        const countRes = await client.query(`
          SELECT COUNT(*) AS active_count FROM bookings
          WHERE session_id = $1 
            AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
        `, [targetSession.id]);

        const activeCount = parseInt(countRes.rows[0].active_count, 10);
        if (activeCount >= targetSession.capacity) {
          throw new BookingError('Target slot is already fully booked', 409, 'SLOT_FULL');
        }
      } else {
        const conflictRes = await client.query(`
          SELECT id FROM sessions
          WHERE host_id = $1
            AND status = 'active'
            AND id != $2
            AND blocked_range && tstzrange($3::timestamptz, $4::timestamptz, '[)')
        `, [booking.host_id, booking.old_session_id, newBlockedStartIso, newBlockedEndIso]);

        if (conflictRes.rows.length > 0) {
          throw new BookingError('Target slot conflicts with an existing booking or buffer window', 409, 'SLOT_CONFLICT');
        }

        const newSessRes = await client.query(`
          INSERT INTO sessions (
            host_id, event_type_id, start_at, end_at, blocked_range, capacity, status
          )
          VALUES ($1, $2, $3, $4, tstzrange($5::timestamptz, $6::timestamptz, '[)'), $7, 'active')
          RETURNING *;
        `, [booking.host_id, booking.event_type_id, newStartIso, newEndIso, newBlockedStartIso, newBlockedEndIso, booking.capacity]);

        targetSession = newSessRes.rows[0];
      }

      await client.query(`
        UPDATE bookings
        SET session_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [targetSession.id, booking.id]);

      await BookingService.cleanupSessionIfEmpty(client, booking.old_session_id);

      const notificationPayload = {
        booking_id: booking.id,
        guest_name: booking.guest_name,
        guest_email: booking.guest_email,
        event_name: booking.event_name,
        old_start_at: booking.old_start.toISOString(),
        new_start_at: newStartIso,
      };

      await client.query(`
        INSERT INTO notifications (type, payload, status)
        VALUES ('booking.rescheduled', $1, 'pending')
      `, [JSON.stringify(notificationPayload)]);

      return {
        booking_id: booking.id,
        new_start_at: newStartIso,
        new_end_at: newEndIso,
        event_name: booking.event_name,
      };
    });

    notifySlotsChanged();
    return result;
  }

  /**
   * Cancel booking (idempotent).
   */
  static async cancelBooking(token: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BookingError('Cancellation reason is required', 400, 'REASON_REQUIRED');
    }

    const tokenHash = hashToken(token);

    const result = await withTransaction(async (client) => {
      const bRes = await client.query(`
        SELECT b.*, s.host_id, s.start_at, s.end_at, et.name AS event_name
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        JOIN event_types et ON s.event_type_id = et.id
        WHERE b.token_hash = $1
        FOR UPDATE
      `, [tokenHash]);

      if (bRes.rows.length === 0) {
        throw new BookingError('Booking not found', 404, 'BOOKING_NOT_FOUND');
      }
      const booking = bRes.rows[0];

      await client.query('SELECT id FROM hosts WHERE id = $1 FOR UPDATE', [booking.host_id]);

      if (booking.status === 'cancelled') {
        return {
          booking_id: booking.id,
          status: 'cancelled',
          cancel_reason: booking.cancel_reason,
          message: 'Booking was already cancelled',
        };
      }

      await client.query(`
        UPDATE bookings
        SET status = 'cancelled',
            cancel_reason = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [reason.trim(), booking.id]);

      await BookingService.cleanupSessionIfEmpty(client, booking.session_id);

      const notificationPayload = {
        booking_id: booking.id,
        guest_name: booking.guest_name,
        guest_email: booking.guest_email,
        event_name: booking.event_name,
        start_at: booking.start_at.toISOString(),
        cancel_reason: reason.trim(),
      };

      await client.query(`
        INSERT INTO notifications (type, payload, status)
        VALUES ('booking.cancelled', $1, 'pending')
      `, [JSON.stringify(notificationPayload)]);

      return {
        booking_id: booking.id,
        status: 'cancelled',
        cancel_reason: reason.trim(),
      };
    });

    notifySlotsChanged();
    return result;
  }

  /**
   * Explicitly release a temporary hold (e.g. guest navigates back or cancels hold).
   */
  static async releaseHold(holdId: string): Promise<boolean> {
    const result = await withTransaction(async (client) => {
      const bRes = await client.query(`
        SELECT b.id, b.session_id, s.host_id
        FROM bookings b
        JOIN sessions s ON b.session_id = s.id
        WHERE b.id = $1 AND b.status = 'held'
        FOR UPDATE
      `, [holdId]);

      if (bRes.rows.length === 0) {
        return false;
      }

      const booking = bRes.rows[0];
      await client.query('SELECT id FROM hosts WHERE id = $1 FOR UPDATE', [booking.host_id]);

      await client.query(`
        UPDATE bookings
        SET status = 'expired', updated_at = NOW()
        WHERE id = $1
      `, [holdId]);

      await BookingService.cleanupSessionIfEmpty(client, booking.session_id);
      return true;
    });

    if (result) {
      notifySlotsChanged();
    }
    return result;
  }

  private static async cleanupSessionIfEmpty(client: any, sessionId: string) {
    const activeRes = await client.query(`
      SELECT COUNT(*) AS active_count FROM bookings
      WHERE session_id = $1 
        AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
    `, [sessionId]);

    if (parseInt(activeRes.rows[0].active_count, 10) === 0) {
      await client.query(`
        UPDATE sessions SET status = 'released' WHERE id = $1
      `, [sessionId]);
    }
  }
}

