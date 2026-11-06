import { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/db.js';

interface RateRecord {
  count: number;
  resetAt: number;
}

const ipRequestMap = new Map<string, RateRecord>();
const ipHoldCountMap = new Map<string, { holds: Set<string>; resetAt: number }>();

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestMap.entries()) {
    if (now > record.resetAt) ipRequestMap.delete(ip);
  }
  for (const [ip, record] of ipHoldCountMap.entries()) {
    if (now > record.resetAt) ipHoldCountMap.delete(ip);
  }
}, 300000);

export async function rateLimiter(req: FastifyRequest, reply: FastifyReply) {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 150; // 150 req/min

  const record = ipRequestMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + windowMs;
  } else {
    record.count++;
  }
  ipRequestMap.set(ip, record);

  reply.header('X-RateLimit-Limit', maxRequests);
  reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
  reply.header('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

  if (record.count > maxRequests) {
    return reply.status(429).send({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again in one minute.',
    });
  }
}

export async function botHoldProtector(req: FastifyRequest, reply: FastifyReply) {
  // Check active unconfirmed holds across database
  const maxActiveHoldsPerGuest = 5;
  try {
    const activeRes = await pool.query(`
      SELECT COUNT(*) AS active_count 
      FROM bookings 
      WHERE status = 'held' AND hold_expires_at > NOW()
    `);
    const totalActiveHolds = parseInt(activeRes.rows[0].active_count, 10);
    // Global threshold protection against bot floods
    if (totalActiveHolds > 500) {
      return reply.status(429).send({
        error: 'SYSTEM_HOLD_CONGESTION',
        message: 'System is experiencing high reservation volume. Please retry in a few moments.',
      });
    }
  } catch {
    // If DB check fails, proceed without blocking
  }
}

