import { FastifyInstance } from 'fastify';
import { loginHandler, logoutHandler, meHandler } from '../controllers/authController.js';
import { requireHostAuth } from '../middleware/authMiddleware.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', loginHandler);
  app.post('/api/auth/logout', logoutHandler);
  app.get('/api/auth/me', { preHandler: requireHostAuth }, meHandler);
}

