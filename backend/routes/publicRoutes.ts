import { FastifyInstance } from 'fastify';
import {
  getSlots,
  createHold,
  confirmHold,
  releaseHold,
  getBookingByToken,
  getBookingIcs,
  rescheduleBooking,
  cancelBooking,
  joinWaitlist,
} from '../controllers/bookingController.js';
import { pool } from '../config/db.js';
import { slotEventEmitter } from '../lib/eventBus.js';
import { rateLimiter, botHoldProtector } from '../middleware/abuseProtection.js';

export async function publicRoutes(app: FastifyInstance) {
  // Optional Extension: Abuse Protection (Rate limiting on public booking endpoints)
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/hosts') || req.url.startsWith('/api/holds')) {
      await rateLimiter(req, reply);
    }
  });

  // Public booking endpoints
  app.get('/api/hosts/:host/events/:slug/slots', getSlots);
  app.post('/api/hosts/:host/events/:slug/slots/waitlist', joinWaitlist);

  // Real-time Server-Sent Events (SSE) Stream for Instant Slot Sync
  app.get('/api/hosts/:host/events/:slug/slots/stream', (req, reply) => {
    const { host } = req.params as { host: string; slug: string };

    // Hijack the response to allow long-lived SSE streaming without Fastify closing the connection
    reply.hijack();

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    reply.raw.flushHeaders();

    reply.raw.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

    const onUpdate = (event: any) => {
      if (!reply.raw.destroyed && (!event || !event.hostSlug || event.hostSlug === host)) {
        try {
          reply.raw.write(`data: ${JSON.stringify({ type: 'SLOTS_UPDATED', timestamp: Date.now() })}\n\n`);
        } catch {
          // Client disconnected
        }
      }
    };

    slotEventEmitter.on('slots_changed', onUpdate);

    const heartbeat = setInterval(() => {
      if (reply.raw.destroyed) {
        clearInterval(heartbeat);
        return;
      }
      try {
        reply.raw.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      slotEventEmitter.off('slots_changed', onUpdate);
      if (!reply.raw.destroyed) {
        try {
          reply.raw.end();
        } catch {}
      }
    });
  });

  app.post('/api/holds', { preHandler: botHoldProtector }, createHold);
  app.post('/api/holds/:id/confirm', confirmHold);
  app.post('/api/holds/:id/release', releaseHold);
  app.delete('/api/holds/:id', releaseHold);
  app.get('/api/bookings/:token', getBookingByToken);
  app.get('/api/bookings/:token/ics', getBookingIcs);
  app.post('/api/bookings/:token/reschedule', rescheduleBooking);
  app.post('/api/bookings/:token/cancel', cancelBooking);

  // Health and Observability (Optional Extension)
  app.get('/health', async (_req, reply) => {
    try {
      const [dbCheck, notifStats, holdsStats, totalBookingsRes, confirmedBookingsRes, expiredHoldsRes, lagRes, waitlistRes] = await Promise.all([
        pool.query('SELECT 1 AS ok'),
        pool.query("SELECT COUNT(*) AS pending_count FROM notifications WHERE status = 'pending'"),
        pool.query("SELECT COUNT(*) AS active_holds FROM bookings WHERE status = 'held' AND hold_expires_at > NOW()"),
        pool.query('SELECT COUNT(*) AS total FROM bookings'),
        pool.query("SELECT COUNT(*) AS confirmed FROM bookings WHERE status = 'confirmed'"),
        pool.query("SELECT COUNT(*) AS expired FROM bookings WHERE status = 'expired'"),
        pool.query("SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000), 0) AS lag_ms FROM notifications WHERE status = 'pending'"),
        pool.query("SELECT COUNT(*) AS waiting FROM waitlists WHERE status = 'waiting'"),
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
          total_bookings: parseInt(totalBookingsRes.rows[0].total, 10),
          confirmed_bookings: parseInt(confirmedBookingsRes.rows[0].confirmed, 10),
          active_holds: parseInt(holdsStats.rows[0].active_holds, 10),
          hold_expiries: parseInt(expiredHoldsRes.rows[0].expired, 10),
          pending_notifications: parseInt(notifStats.rows[0].pending_count, 10),
          notification_lag_ms: parseInt(lagRes.rows[0].lag_ms, 10),
          active_waitlists: parseInt(waitlistRes.rows[0].waiting, 10),
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

  // Mock Webhook Receiver & Inspection Log
  const mockWebhookLogs: any[] = [];
  app.post('/api/mock-webhook', async (req, reply) => {
    mockWebhookLogs.push({
      received_at: new Date().toISOString(),
      headers: req.headers,
      payload: req.body,
    });
    return reply.send({ received: true });
  });

  app.get('/api/mock-webhook/logs', async (_req, reply) => {
    return reply.send(mockWebhookLogs);
  });
}

