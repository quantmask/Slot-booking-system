import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { pool } from '../config/db.js';
import { verifyPassword } from '../lib/security.js';

export async function loginHandler(req: FastifyRequest, reply: FastifyReply) {
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
    maxAge: 86400 * 7,
  });

  return reply.send({
    id: host.id,
    slug: host.slug,
    email: host.email,
    timezone: host.timezone,
  });
}

export async function logoutHandler(_req: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie('slotbook_host_session', { path: '/' });
  return reply.send({ success: true, message: 'Logged out successfully' });
}

export async function meHandler(req: FastifyRequest, reply: FastifyReply) {
  return reply.send((req as any).authHost);
}

