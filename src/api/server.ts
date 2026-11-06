import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { verifyPassword, hashPassword, isValidTimezone as checkTz } from '../core/security.js';
import { generateSlots, isValidTimezone } from '../core/slot_engine.js';
import { BookingService, BookingError } from '../core/booking_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildServer(): FastifyInstance {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    genReqId: () => `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  });

  // Plugins
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.register(cookie, {
    secret: process.env.SESSION_SECRET || 'slotbook-secret-key-at-least-32-chars-length',
    hook: 'onRequest',
  });

  // Global Error Handler conforming to PRD error contract
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof BookingError) {
      return reply.status(error.statusCode).send({
        error: error.code || 'BOOKING_ERROR',
        message: error.message,
      });
    }

    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        issues: error.issues,
      });
    }

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: error.name || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
    });
  });

  // Enhanced Health check with metrics and DB stats (Optional Extension)
  app.get('/health', async (_req, reply) => {
    try {
      const [dbCheck, notifStats, holdsStats] = await Promise.all([
        pool.query('SELECT 1 AS ok'),
        pool.query("SELECT COUNT(*) AS pending_count FROM notifications WHERE status = 'pending'"),
        pool.query("SELECT COUNT(*) AS active_holds FROM bookings WHERE status = 'held' AND hold_expires_at > NOW()"),
      ]);

      return reply.send({
        status: 'ok',
        uptime: process.uptime(),
        database: dbCheck.rows.length === 1 ? 'connected' : 'error',
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount,
        },
        metrics: {
          pending_notifications: parseInt(notifStats.rows[0].pending_count, 10),
          active_holds: parseInt(holdsStats.rows[0].active_holds, 10),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.status(503).send({
        status: 'degraded',
        database: 'disconnected',
        error: err.message,
      });
    }
  });

  // Authentication Helper Middleware
  async function requireHostAuth(req: FastifyRequest, reply: FastifyReply) {
    const sessionCookie = req.cookies.slotbook_host_session;
    if (!sessionCookie) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Host session cookie required' });
    }

    const unsigned = req.unsignCookie(sessionCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid session signature' });
    }

    const hostId = unsigned.value;
    const hostRes = await pool.query('SELECT id, slug, email, timezone FROM hosts WHERE id = $1', [hostId]);
    if (hostRes.rows.length === 0) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Host no longer exists' });
    }

    (req as any).authHost = hostRes.rows[0];
  }

  // --- Auth Routes ---
  app.post('/api/auth/login', async (req, reply) => {
    const LoginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const { email, password } = LoginSchema.parse(req.body);

    const hostRes = await pool.query('SELECT * FROM hosts WHERE email = $1', [email]);
    if (hostRes.rows.length === 0) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' });
    }

    const host = hostRes.rows[0];
    const passwordValid = verifyPassword(password, host.password_hash);
    if (!passwordValid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' });
    }

    reply.setCookie('slotbook_host_session', host.id, {
      path: '/',
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      maxAge: 86400 * 7, // 7 days
    });

    return reply.send({
      id: host.id,
      slug: host.slug,
      email: host.email,
      timezone: host.timezone,
    });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie('slotbook_host_session', { path: '/' });
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  app.get('/api/auth/me', { preHandler: requireHostAuth }, async (req, reply) => {
    return reply.send((req as any).authHost);
  });

  // --- Host Dashboard Endpoints (Protected) ---
  app.get('/api/host/profile', { preHandler: requireHostAuth }, async (req, reply) => {
    return reply.send((req as any).authHost);
  });

  app.put('/api/host/profile', { preHandler: requireHostAuth }, async (req, reply) => {
    const TzSchema = z.object({
      timezone: z.string().refine(isValidTimezone, { message: 'Invalid IANA timezone name' }),
    });
    const { timezone } = TzSchema.parse(req.body);
    const host = (req as any).authHost;

    await pool.query('UPDATE hosts SET timezone = $1 WHERE id = $2', [timezone, host.id]);
    host.timezone = timezone;
    return reply.send(host);
  });

  app.get('/api/host/event-types', { preHandler: requireHostAuth }, async (req, reply) => {
    const host = (req as any).authHost;
    const res = await pool.query(`
      SELECT * FROM event_types 
      WHERE host_id = $1 AND archived_at IS NULL
      ORDER BY name ASC
    `, [host.id]);
    return reply.send(res.rows);
  });

  app.post('/api/host/event-types', { preHandler: requireHostAuth }, async (req, reply) => {
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
  });

  app.put('/api/host/event-types/:id', { preHandler: requireHostAuth }, async (req, reply) => {
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
  });

  app.get('/api/host/availability', { preHandler: requireHostAuth }, async (req, reply) => {
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
  });

  app.put('/api/host/availability', { preHandler: requireHostAuth }, async (req, reply) => {
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
  });

  app.get('/api/host/bookings', { preHandler: requireHostAuth }, async (req, reply) => {
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
  });

  app.post('/api/host/bookings/:id/cancel', { preHandler: requireHostAuth }, async (req, reply) => {
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

      // Outbox
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
  });

  // --- Public Booking Endpoints ---

  // Available Slots Listing (PRD G-1, G-2, T1-T5)
  app.get('/api/hosts/:host/events/:slug/slots', async (req, reply) => {
    const { host: hostSlug, slug: eventSlug } = req.params as { host: string; slug: string };
    const queryParams = req.query as { from?: string; to?: string; tz?: string };

    const guestTz = queryParams.tz || 'UTC';
    if (!isValidTimezone(guestTz)) {
      return reply.status(400).send({ error: 'INVALID_TIMEZONE', message: `Invalid timezone identifier: ${guestTz}` });
    }

    // Load Host
    const hostRes = await pool.query('SELECT * FROM hosts WHERE slug = $1', [hostSlug]);
    if (hostRes.rows.length === 0) {
      return reply.status(404).send({ error: 'HOST_NOT_FOUND', message: `Host '${hostSlug}' not found` });
    }
    const host = hostRes.rows[0];

    // Load Event Type
    const eventRes = await pool.query(`
      SELECT * FROM event_types WHERE host_id = $1 AND slug = $2 AND archived_at IS NULL
    `, [host.id, eventSlug]);
    if (eventRes.rows.length === 0) {
      return reply.status(404).send({ error: 'EVENT_NOT_FOUND', message: `Event '${eventSlug}' not found` });
    }
    const eventType = eventRes.rows[0];

    // Load Availability
    const weeklyRes = await pool.query('SELECT weekday, start_time::text, end_time::text FROM weekly_availability WHERE host_id = $1', [host.id]);
    const overrideRes = await pool.query('SELECT date::text, is_off, start_time::text, end_time::text FROM date_overrides WHERE host_id = $1', [host.id]);

    // Load Active Sessions and their booking counts
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
  });

  // Hold a Slot (PRD G-3, 5-minute countdown, Idempotency-Key support)
  app.post('/api/holds', async (req, reply) => {
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
  });

  // Confirm Hold (PRD G-4, private manage token returned once)
  app.post('/api/holds/:id/confirm', async (req, reply) => {
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
  });

  // View Booking via Private Manage Token (PRD G-6)
  app.get('/api/bookings/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const booking = await BookingService.getBookingByToken(token);
    return reply.send(booking);
  });

  // Reschedule Booking (PRD G-6, atomic move)
  app.post('/api/bookings/:token/reschedule', async (req, reply) => {
    const { token } = req.params as { token: string };
    const ReschedSchema = z.object({
      newSlotStart: z.string().min(1, 'New slot start ISO timestamp is required'),
    });
    const { newSlotStart } = ReschedSchema.parse(req.body);

    const result = await BookingService.rescheduleBooking(token, newSlotStart);
    return reply.send(result);
  });

  // Cancel Booking (PRD G-6, idempotent)
  app.post('/api/bookings/:token/cancel', async (req, reply) => {
    const { token } = req.params as { token: string };
    const CancelSchema = z.object({
      reason: z.string().min(1, 'Cancellation reason is required'),
    });
    const { reason } = CancelSchema.parse(req.body);

    const result = await BookingService.cancelBooking(token, reason);
    return reply.send(result);
  });

  // Local Webhook Sink for Testing & Proof (PRD 5.4, R12)
  const webhookReceivedLogs: any[] = [];
  app.post('/api/mock-webhook', async (req, reply) => {
    webhookReceivedLogs.push({
      received_at: new Date().toISOString(),
      payload: req.body,
    });
    return reply.send({ received: true });
  });

  app.get('/api/mock-webhook/logs', async (_req, reply) => {
    return reply.send(webhookReceivedLogs);
  });

  // Serve Frontend static assets if client-dist exists
  const clientDist = path.join(process.cwd(), 'client-dist');
  if (fs.existsSync(clientDist)) {
    app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api')) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'API route not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
