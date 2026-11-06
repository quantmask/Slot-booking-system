import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { pool } from '../config/db.js';
import { runMigrations } from '../scripts/migrate.js';
import { seedDatabase } from '../seeds/seed.js';
import { FastifyInstance } from 'fastify';

describe('Fastify REST API Integration Tests', () => {
  let app: FastifyInstance;
  let authCookie: string;

  beforeAll(async () => {
    await runMigrations();
    await seedDatabase();
    await pool.query('DELETE FROM notifications;');
    await pool.query('DELETE FROM bookings;');
    await pool.query('DELETE FROM sessions;');
    await pool.query('DELETE FROM idempotency_keys;');
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('GET /health returns 200 with DB status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });

  it('POST /api/auth/login succeeds with valid seeded credentials and sets session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'alex.wright@slotbook.io',
        password: 'SlotBook@Secure2026!',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('alex.wright@slotbook.io');
    expect(body.slug).toBe('alex');

    const cookies = res.cookies;
    expect(cookies.length).toBeGreaterThan(0);
    const sessionCookie = cookies.find(c => c.name === 'slotbook_host_session');
    expect(sessionCookie).toBeDefined();
    authCookie = `${sessionCookie!.name}=${sessionCookie!.value}`;
  });

  it('GET /api/auth/me returns 401 when unauthenticated and 200 when authenticated', async () => {
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
    });
    expect(unauth.statusCode).toBe(401);

    const auth = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: authCookie },
    });
    expect(auth.statusCode).toBe(200);
    const body = JSON.parse(auth.body);
    expect(body.slug).toBe('alex');
  });

  it('GET /api/hosts/:host/events/:slug/slots rejects invalid timezone with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/quick-catchup/slots?tz=Invalid/Timezone',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('INVALID_TIMEZONE');
  });

  it('GET /api/hosts/:host/events/:slug/slots returns valid slots for valid IANA timezone', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/quick-catchup/slots?tz=Asia/Kolkata',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.host.slug).toBe('alex');
    expect(body.event.slug).toBe('quick-catchup');
    expect(Array.isArray(body.slots)).toBe(true);
    expect(body.slots.length).toBeGreaterThan(0);
  });

  it('Full guest flow: hold slot -> confirm booking -> view booking -> cancel booking', async () => {
    const slotsRes = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/quick-catchup/slots?tz=UTC',
    });
    const { slots } = JSON.parse(slotsRes.body);
    expect(slots.length).toBeGreaterThan(0);
    const targetSlot = slots[0];

    const holdRes = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'idempotency-key': `api-test-${Date.now()}` },
      payload: {
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart: targetSlot.start_at,
      },
    });

    expect(holdRes.statusCode).toBe(201);
    const hold = JSON.parse(holdRes.body);
    expect(hold.hold_id).toBeDefined();

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/holds/${hold.hold_id}/confirm`,
      payload: {
        guestName: 'Jane Doe',
        guestEmail: 'jane@example.com',
      },
    });

    expect(confirmRes.statusCode).toBe(200);
    const confirmed = JSON.parse(confirmRes.body);
    expect(confirmed.token).toBeDefined();
    expect(confirmed.guest_name).toBe('Jane Doe');

    const viewRes = await app.inject({
      method: 'GET',
      url: `/api/bookings/${confirmed.token}`,
    });
    expect(viewRes.statusCode).toBe(200);
    const booking = JSON.parse(viewRes.body);
    expect(booking.status).toBe('confirmed');
    expect(booking.guest_name).toBe('Jane Doe');

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/bookings/${confirmed.token}/cancel`,
      payload: { reason: 'Schedule conflict' },
    });
    expect(cancelRes.statusCode).toBe(200);

    const viewAgain = await app.inject({
      method: 'GET',
      url: `/api/bookings/${confirmed.token}`,
    });
    const updatedBooking = JSON.parse(viewAgain.body);
    expect(updatedBooking.status).toBe('cancelled');
    expect(updatedBooking.cancel_reason).toBe('Schedule conflict');
  });
});

