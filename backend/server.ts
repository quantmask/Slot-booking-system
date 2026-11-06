import fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { BookingError } from './services/BookingService.js';
import { authRoutes } from './routes/authRoutes.js';
import { hostRoutes } from './routes/hostRoutes.js';
import { publicRoutes } from './routes/publicRoutes.js';

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

  // Error Handler
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

    const err = error as any;
    const statusCode = err.statusCode || 500;
    return reply.status(statusCode).send({
      error: err.name || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    });
  });

  // Register Routes
  app.register(authRoutes);
  app.register(hostRoutes);
  app.register(publicRoutes);

  // Serve Frontend static assets if dist exists
  const clientDist = path.resolve(__dirname, '../frontend/dist');
  const localDist = path.resolve(__dirname, 'dist');
  const staticRoot = fs.existsSync(clientDist) ? clientDist : (fs.existsSync(localDist) ? localDist : null);

  if (staticRoot) {
    app.register(fastifyStatic, {
      root: staticRoot,
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

