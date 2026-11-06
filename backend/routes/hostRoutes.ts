import { FastifyInstance } from 'fastify';
import {
  getProfile,
  updateProfile,
  getEventTypes,
  createEventType,
  updateEventType,
  getAvailability,
  updateAvailability,
  getHostBookings,
  hostCancelBooking,
  getBusyTimes,
  createBusyTime,
  importIcsBusyTimes,
  deleteBusyTime,
  getWebhooks,
  saveWebhook,
  getWebhookLogs,
  getHostWaitlists,
  getHostReminders,
} from '../controllers/hostController.js';
import { requireHostAuth } from '../middleware/authMiddleware.js';

export async function hostRoutes(app: FastifyInstance) {
  app.register(async (hostScope) => {
    hostScope.addHook('preHandler', requireHostAuth);

    hostScope.get('/api/host/profile', getProfile);
    hostScope.put('/api/host/profile', updateProfile);
    hostScope.get('/api/host/event-types', getEventTypes);
    hostScope.post('/api/host/event-types', createEventType);
    hostScope.put('/api/host/event-types/:id', updateEventType);
    hostScope.get('/api/host/availability', getAvailability);
    hostScope.put('/api/host/availability', updateAvailability);
    hostScope.get('/api/host/bookings', getHostBookings);
    hostScope.post('/api/host/bookings/:id/cancel', hostCancelBooking);

    hostScope.get('/api/host/busy-times', getBusyTimes);
    hostScope.post('/api/host/busy-times', createBusyTime);
    hostScope.post('/api/host/busy-times/import-ics', importIcsBusyTimes);
    hostScope.delete('/api/host/busy-times/:id', deleteBusyTime);

    hostScope.get('/api/host/webhooks', getWebhooks);
    hostScope.post('/api/host/webhooks', saveWebhook);
    hostScope.get('/api/host/webhooks/logs', getWebhookLogs);

    hostScope.get('/api/host/waitlists', getHostWaitlists);
    hostScope.get('/api/host/reminders', getHostReminders);
  });
}
