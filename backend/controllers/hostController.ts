import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { isValidTimezone } from '../lib/slot_engine.js';

export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  return reply.send((req as any).authHost);
}

export async function updateProfile(req: FastifyRequest, reply: FastifyReply) {
  const TzSchema = z.object({
    timezone: z.string().refine(isValidTimezone, { message: 'Invalid IANA timezone name' }),
  });
  const { timezone } = TzSchema.parse(req.body);
  const host = (req as any).authHost;

  await pool.query('UPDATE hosts SET timezone = $1 WHERE id = $2', [timezone, host.id]);
  host.timezone = timezone;
  return reply.send(host);
}

export async function getEventTypes(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT * FROM event_types 
    WHERE host_id = $1 AND archived_at IS NULL
    ORDER BY name ASC
  `, [host.id]);
  return reply.send(res.rows);
}

export async function createEventType(req: FastifyRequest, reply: FastifyReply) {
  const EventSchema = z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    duration_min: z.number().int().min(15).max(120),
    capacity: z.number().int().min(1),
    buffer_before_min: z.number().int().min(0).max(30).default(0),
    buffer_after_min: z.number().int().min(0).max(30).default(0),
    min_notice_hours: z.number().int().min(0).default(4),
    horizon_days: z.number().int().min(1).default(30),
  });
  const parsed = EventSchema.parse(req.body);
  const host = (req as any).authHost;

  const res = await pool.query(`
    INSERT INTO event_types (
      host_id, slug, name, duration_min, capacity, buffer_before_min, buffer_after_min, min_notice_hours, horizon_days
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `, [
    host.id, parsed.slug, parsed.name, parsed.duration_min, parsed.capacity,
    parsed.buffer_before_min, parsed.buffer_after_min, parsed.min_notice_hours, parsed.horizon_days,
  ]);

  return reply.status(201).send(res.rows[0]);
}

export async function updateEventType(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const host = (req as any).authHost;
  const UpdateSchema = z.object({
    name: z.string().min(1).optional(),
    duration_min: z.number().int().min(15).max(120).optional(),
    capacity: z.number().int().min(1).optional(),
    buffer_before_min: z.number().int().min(0).max(30).optional(),
    buffer_after_min: z.number().int().min(0).max(30).optional(),
    min_notice_hours: z.number().int().min(0).optional(),
    horizon_days: z.number().int().min(1).optional(),
    archived: z.boolean().optional(),
  });
  const parsed = UpdateSchema.parse(req.body);

  const currentRes = await pool.query('SELECT * FROM event_types WHERE id = $1 AND host_id = $2', [id, host.id]);
  if (currentRes.rows.length === 0) {
    return reply.status(404).send({ error: 'EVENT_NOT_FOUND', message: 'Event type not found' });
  }

  const cur = currentRes.rows[0];
  const archivedAt = parsed.archived !== undefined ? (parsed.archived ? new Date() : null) : cur.archived_at;

  const updatedRes = await pool.query(`
    UPDATE event_types
    SET name = COALESCE($1, name),
        duration_min = COALESCE($2, duration_min),
        capacity = COALESCE($3, capacity),
        buffer_before_min = COALESCE($4, buffer_before_min),
        buffer_after_min = COALESCE($5, buffer_after_min),
        min_notice_hours = COALESCE($6, min_notice_hours),
        horizon_days = COALESCE($7, horizon_days),
        archived_at = $8
    WHERE id = $9 AND host_id = $10
    RETURNING *;
  `, [
    parsed.name ?? null,
    parsed.duration_min ?? null,
    parsed.capacity ?? null,
    parsed.buffer_before_min ?? null,
    parsed.buffer_after_min ?? null,
    parsed.min_notice_hours ?? null,
    parsed.horizon_days ?? null,
    archivedAt,
    id,
    host.id,
  ]);

  return reply.send(updatedRes.rows[0]);
}

export async function getAvailability(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const weeklyRes = await pool.query(`
    SELECT weekday, start_time::text, end_time::text 
    FROM weekly_availability 
    WHERE host_id = $1 
    ORDER BY weekday ASC, start_time ASC
  `, [host.id]);

  const overridesRes = await pool.query(`
    SELECT date::text, is_off, start_time::text, end_time::text 
    FROM date_overrides 
    WHERE host_id = $1 
    ORDER BY date ASC
  `, [host.id]);

  return reply.send({
    weekly: weeklyRes.rows,
    overrides: overridesRes.rows,
  });
}

export async function updateAvailability(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const AvailSchema = z.object({
    weekly: z.array(z.object({
      weekday: z.number().int().min(1).max(7),
      start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
      end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    })),
    overrides: z.array(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      is_off: z.boolean(),
      start_time: z.string().optional().nullable(),
      end_time: z.string().optional().nullable(),
    })),
  });

  const parsed = AvailSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM weekly_availability WHERE host_id = $1', [host.id]);
    for (const w of parsed.weekly) {
      await client.query(`
        INSERT INTO weekly_availability (host_id, weekday, start_time, end_time)
        VALUES ($1, $2, $3, $4)
      `, [host.id, w.weekday, w.start_time, w.end_time]);
    }

    await client.query('DELETE FROM date_overrides WHERE host_id = $1', [host.id]);
    for (const o of parsed.overrides) {
      await client.query(`
        INSERT INTO date_overrides (host_id, date, is_off, start_time, end_time)
        VALUES ($1, $2, $3, $4, $5)
      `, [host.id, o.date, o.is_off, o.start_time || null, o.end_time || null]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return reply.send({ success: true });
}

export async function getHostBookings(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT b.id, b.status, b.guest_name, b.guest_email, b.cancel_reason, b.created_at,
           s.start_at, s.end_at,
           et.name AS event_name, et.slug AS event_slug, et.duration_min
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN event_types et ON s.event_type_id = et.id
    WHERE s.host_id = $1
    ORDER BY s.start_at ASC
  `, [host.id]);

  return reply.send(res.rows);
}

export async function hostCancelBooking(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const host = (req as any).authHost;
  const CancelSchema = z.object({
    reason: z.string().min(1, 'Cancellation reason is required'),
  });
  const { reason } = CancelSchema.parse(req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bRes = await client.query(`
      SELECT b.*, s.start_at, et.name AS event_name
      FROM bookings b
      JOIN sessions s ON b.session_id = s.id
      JOIN event_types et ON s.event_type_id = et.id
      WHERE b.id = $1 AND s.host_id = $2
      FOR UPDATE
    `, [id, host.id]);

    if (bRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return reply.status(404).send({ error: 'BOOKING_NOT_FOUND', message: 'Booking not found' });
    }

    const booking = bRes.rows[0];
    await client.query(`
      UPDATE bookings SET status = 'cancelled', cancel_reason = $1, updated_at = NOW() WHERE id = $2
    `, [reason, id]);

    await client.query(`
      INSERT INTO notifications (type, payload, status)
      VALUES ('booking.cancelled', $1, 'pending')
    `, [JSON.stringify({
      booking_id: id,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      event_name: booking.event_name,
      start_at: booking.start_at.toISOString(),
      cancel_reason: reason,
      cancelled_by: 'host',
    })]);

    await client.query('COMMIT');
    return reply.send({ booking_id: id, status: 'cancelled' });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ==========================================
// OPTIONAL EXTENSION CONTROLLERS
// ==========================================

// 1. External Busy Times
export async function getBusyTimes(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT id, title, start_at, end_at, created_at
    FROM external_busy_times
    WHERE host_id = $1
    ORDER BY start_at ASC
  `, [host.id]);
  return reply.send(res.rows);
}

export async function createBusyTime(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const Schema = z.object({
    title: z.string().min(1).default('Busy Block'),
    start_at: z.string().min(1),
    end_at: z.string().min(1),
  });
  const parsed = Schema.parse(req.body);

  const res = await pool.query(`
    INSERT INTO external_busy_times (host_id, title, start_at, end_at)
    VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
    RETURNING *;
  `, [host.id, parsed.title, parsed.start_at, parsed.end_at]);

  return reply.status(201).send(res.rows[0]);
}

export async function importIcsBusyTimes(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const Schema = z.object({
    icsContent: z.string().min(1),
  });
  const { icsContent } = Schema.parse(req.body);

  // Simple RFC 5545 parser for VEVENT blocks
  const events = icsContent.split('BEGIN:VEVENT');
  let importedCount = 0;

  for (let i = 1; i < events.length; i++) {
    const block = events[i].split('END:VEVENT')[0];
    const dtstartMatch = block.match(/DTSTART(?:;[^:]+)?:([0-9TZ]+)/);
    const dtendMatch = block.match(/DTEND(?:;[^:]+)?:([0-9TZ]+)/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);

    if (dtstartMatch && dtendMatch) {
      const parseIcsDate = (str: string) => {
        // e.g. 20261110T090000Z or 20261110T090000
        const y = str.substring(0, 4);
        const m = str.substring(4, 6);
        const d = str.substring(6, 8);
        const h = str.substring(9, 11) || '00';
        const min = str.substring(11, 13) || '00';
        const s = str.substring(13, 15) || '00';
        return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
      };

      try {
        const start = parseIcsDate(dtstartMatch[1]);
        const end = parseIcsDate(dtendMatch[1]);
        const title = summaryMatch ? summaryMatch[1].trim() : 'External Busy Block';

        if (start < end) {
          await pool.query(`
            INSERT INTO external_busy_times (host_id, title, start_at, end_at)
            VALUES ($1, $2, $3, $4)
          `, [host.id, title, start, end]);
          importedCount++;
        }
      } catch {
        // Ignore unparseable individual event
      }
    }
  }

  return reply.send({ status: 'ok', imported: importedCount });
}

export async function deleteBusyTime(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const { id } = req.params as { id: string };
  await pool.query('DELETE FROM external_busy_times WHERE id = $1 AND host_id = $2', [id, host.id]);
  return reply.send({ status: 'ok' });
}

// 2. Host Webhooks with HMAC
export async function getWebhooks(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT id, url, secret_key, is_active, created_at
    FROM host_webhooks
    WHERE host_id = $1
    ORDER BY created_at DESC
  `, [host.id]);
  return reply.send(res.rows);
}

export async function saveWebhook(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const Schema = z.object({
    url: z.string().url('Valid webhook URL is required'),
  });
  const { url } = Schema.parse(req.body);

  const secretKey = 'whsec_' + crypto.randomBytes(24).toString('hex');
  const res = await pool.query(`
    INSERT INTO host_webhooks (host_id, url, secret_key, is_active)
    VALUES ($1, $2, $3, TRUE)
    RETURNING *;
  `, [host.id, url, secretKey]);

  return reply.status(201).send(res.rows[0]);
}

export async function getWebhookLogs(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT id, event_id, event_type, url, status_code, error_message, delivery_duration_ms, created_at
    FROM webhook_logs
    WHERE host_id = $1
    ORDER BY created_at DESC
    LIMIT 30
  `, [host.id]);
  return reply.send(res.rows);
}

// 3. Waitlist & Reminders Inspection
export async function getHostWaitlists(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT w.id, w.guest_name, w.guest_email, w.status, w.offered_at, w.created_at,
           s.start_at, s.end_at, et.name AS event_name
    FROM waitlists w
    JOIN sessions s ON w.session_id = s.id
    JOIN event_types et ON s.event_type_id = et.id
    WHERE s.host_id = $1
    ORDER BY w.created_at DESC
  `, [host.id]);
  return reply.send(res.rows);
}

export async function getHostReminders(req: FastifyRequest, reply: FastifyReply) {
  const host = (req as any).authHost;
  const res = await pool.query(`
    SELECT r.id, r.reminder_type, r.scheduled_for, r.status, r.sent_at,
           b.guest_name, b.guest_email, s.start_at, et.name AS event_name
    FROM reminders r
    JOIN bookings b ON r.booking_id = b.id
    JOIN sessions s ON b.session_id = s.id
    JOIN event_types et ON s.event_type_id = et.id
    WHERE s.host_id = $1
    ORDER BY r.scheduled_for DESC
    LIMIT 50
  `, [host.id]);
  return reply.send(res.rows);
}

