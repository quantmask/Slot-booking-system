import { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../config/db.js';

export async function requireHostAuth(req: FastifyRequest, reply: FastifyReply) {
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

