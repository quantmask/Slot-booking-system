import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { generateSlots, isValidTimezone } from '../lib/slot_engine.js';
import { BookingService } from '../services/BookingService.js';

export async function getSlots(req: FastifyRequest, reply: FastifyReply) {
  const { host: hostSlug, slug: eventSlug } = req.params as { host: string; slug: string };
  const queryParams = req.query as { from?: string; to?: string; tz?: string };

  const guestTz = queryParams.tz || 'UTC';
  if (!isValidTimezone(guestTz)) {
    return reply.status(400).send({ error: 'INVALID_TIMEZONE', message: `Invalid timezone identifier: ${guestTz}` });
  }

  const hostRes = await pool.query('SELECT * FROM hosts WHERE slug = $1', [hostSlug]);
  if (hostRes.rows.length === 0) {
    return reply.status(404).send({ error: 'HOST_NOT_FOUND', message: `Host '${hostSlug}' not found` });
  }
  const host = hostRes.rows[0];

  const eventRes = await pool.query(`
    SELECT * FROM event_types WHERE host_id = $1 AND slug = $2 AND archived_at IS NULL
  `, [host.id, eventSlug]);
  if (eventRes.rows.length === 0) {
    return reply.status(404).send({ error: 'EVENT_NOT_FOUND', message: `Event '${eventSlug}' not found` });
  }
  const eventType = eventRes.rows[0];

  const weeklyRes = await pool.query('SELECT weekday, start_time::text, end_time::text FROM weekly_availability WHERE host_id = $1', [host.id]);
  const overrideRes = await pool.query('SELECT date::text, is_off, start_time::text, end_time::text FROM date_overrides WHERE host_id = $1', [host.id]);

  const sessionsRes = await pool.query(`
    SELECT s.id, s.event_type_id, s.start_at, s.end_at, s.capacity,
           lower(s.blocked_range) AS blocked_start,
           upper(s.blocked_range) AS blocked_end,
           COUNT(b.id) FILTER (WHERE b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW())) AS active_bookings_count
    FROM sessions s
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.host_id = $1 AND s.status = 'active'
    GROUP BY s.id
  `, [host.id]);

  const slots = generateSlots({
    hostTimezone: host.timezone,
    guestTimezone: guestTz,
    eventType: {
      id: eventType.id,
      slug: eventType.slug,
      name: eventType.name,
      duration_min: eventType.duration_min,
      capacity: eventType.capacity,
      buffer_before_min: eventType.buffer_before_min,
      buffer_after_min: eventType.buffer_after_min,
      min_notice_hours: eventType.min_notice_hours,
      horizon_days: eventType.horizon_days,
    },
    weeklyAvailability: weeklyRes.rows,
    dateOverrides: overrideRes.rows,
    existingSessions: sessionsRes.rows,
    fromUtc: queryParams.from,
    toUtc: queryParams.to,
  });

  return reply.send({
    host: { slug: host.slug, timezone: host.timezone },
    event: {
      name: eventType.name,
      slug: eventType.slug,
      duration_min: eventType.duration_min,
      capacity: eventType.capacity,
    },
    slots,
  });
}

export async function createHold(req: FastifyRequest, reply: FastifyReply) {
  const HoldSchema = z.object({
    hostSlug: z.string().min(1),
    eventSlug: z.string().min(1),
    slotStart: z.string().min(1),
  });
  const parsed = HoldSchema.parse(req.body);
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  const result = await BookingService.createHold({
    hostSlug: parsed.hostSlug,
    eventSlug: parsed.eventSlug,
    slotStart: parsed.slotStart,
    idempotencyKey,
  });

  return reply.status(result.statusCode).send(result.data);
}

export async function confirmHold(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const ConfirmSchema = z.object({
    guestName: z.string().min(1, 'Guest name is required'),
    guestEmail: z.string().email('Valid email is required'),
  });
  const parsed = ConfirmSchema.parse(req.body);

  const result = await BookingService.confirmHold({
    holdId: id,
    guestName: parsed.guestName,
    guestEmail: parsed.guestEmail,
  });

  return reply.send(result);
}

export async function getBookingByToken(req: FastifyRequest, reply: FastifyReply) {
  const { token } = req.params as { token: string };
  const booking = await BookingService.getBookingByToken(token);
  return reply.send(booking);
}

export async function rescheduleBooking(req: FastifyRequest, reply: FastifyReply) {
  const { token } = req.params as { token: string };
  const ReschedSchema = z.object({
    newSlotStart: z.string().min(1, 'New slot start ISO timestamp is required'),
  });
  const { newSlotStart } = ReschedSchema.parse(req.body);

  const result = await BookingService.rescheduleBooking(token, newSlotStart);
  return reply.send(result);
}

export async function cancelBooking(req: FastifyRequest, reply: FastifyReply) {
  const { token } = req.params as { token: string };
  const CancelSchema = z.object({
    reason: z.string().min(1, 'Cancellation reason is required'),
  });
  const { reason } = CancelSchema.parse(req.body);

  const result = await BookingService.cancelBooking(token, reason);
  return reply.send(result);
}

