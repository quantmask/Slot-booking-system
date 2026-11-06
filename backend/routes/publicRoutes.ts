import { FastifyInstance } from 'fastify';
import {
  getSlots,
  createHold,
  confirmHold,
  getBookingByToken,
  rescheduleBooking,
  cancelBooking,
} from '../controllers/bookingController.js';
import { pool } from '../config/db.js';

export async function publicRoutes(app: FastifyInstance) {
  // Public booking endpoints
  app.get('/api/hosts/:host/events/:slug/slots', getSlots);
  app.post('/api/holds', createHold);
  app.post('/api/holds/:id/confirm', confirmHold);
  app.get('/api/bookings/:token', getBookingByToken);
  app.post('/api/bookings/:token/reschedule', rescheduleBooking);
  app.post('/api/bookings/:token/cancel', cancelBooking);

  // Health and Observability (Optional Extension)
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

