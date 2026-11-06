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
  });
}

