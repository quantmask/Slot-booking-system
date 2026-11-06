import { withTransaction } from '../config/db.js';
import { BookingError } from './BookingService.js';
import { DateTime } from 'luxon';

export class WaitlistService {
  static async joinWaitlist(params: {
    hostSlug: string;
    eventSlug: string;
    slotStart: string;
    guestName: string;
    guestEmail: string;
  }) {
    const { hostSlug, eventSlug, slotStart, guestName, guestEmail } = params;

    return await withTransaction(async (client) => {
      const hostRes = await client.query('SELECT id FROM hosts WHERE slug = $1', [hostSlug]);
      if (hostRes.rows.length === 0) throw new BookingError(`Host '${hostSlug}' not found`, 404);
      const host = hostRes.rows[0];

      const eventRes = await client.query(
        'SELECT id, name, duration_min FROM event_types WHERE host_id = $1 AND slug = $2',
        [host.id, eventSlug]
      );
      if (eventRes.rows.length === 0) throw new BookingError(`Event '${eventSlug}' not found`, 404);
      const event = eventRes.rows[0];

      const slotStartDt = DateTime.fromISO(slotStart, { zone: 'utc' });
      if (!slotStartDt.isValid) throw new BookingError('Invalid slotStart ISO timestamp', 400);

      const slotStartIso = slotStartDt.toISO()!;
      const slotEndIso = slotStartDt.plus({ minutes: event.duration_min }).toISO()!;

      const sessionRes = await client.query(`
        SELECT id FROM sessions
        WHERE host_id = $1 AND event_type_id = $2 AND start_at = $3::timestamptz AND status = 'active'
      `, [host.id, event.id, slotStartIso]);

      let sessionId: string;
      if (sessionRes.rows.length > 0) {
        sessionId = sessionRes.rows[0].id;
      } else {
        const insRes = await client.query(`
          INSERT INTO sessions (host_id, event_type_id, start_at, end_at, blocked_range, capacity, status)
          VALUES ($1, $2, $3, $4, tstzrange($3::timestamptz, $4::timestamptz, '[)'), 1, 'active')
          RETURNING id;
        `, [host.id, event.id, slotStartIso, slotEndIso]);
        sessionId = insRes.rows[0].id;
      }

      const dup = await client.query(`
        SELECT id FROM waitlists
        WHERE session_id = $1 AND LOWER(guest_email) = LOWER($2) AND status = 'waiting'
      `, [sessionId, guestEmail.trim()]);

      if (dup.rows.length > 0) {
        throw new BookingError('Guest is already registered on the waitlist for this slot', 400, 'ALREADY_WAITLISTED');
      }

      const insWait = await client.query(`
        INSERT INTO waitlists (session_id, guest_name, guest_email, status)
        VALUES ($1, $2, $3, 'waiting')
        RETURNING id;
      `, [sessionId, guestName.trim(), guestEmail.trim().toLowerCase()]);

      const countRes = await client.query(`
        SELECT COUNT(*) AS pos FROM waitlists WHERE session_id = $1 AND status = 'waiting'
      `, [sessionId]);

      return {
        waitlist_id: insWait.rows[0].id,
        position: parseInt(countRes.rows[0].pos, 10),
        status: 'waitlisted',
        message: 'Successfully registered on waitlist. You will receive an offer if a slot opens.',
      };
    });
  }

  static async promoteNextWaitlistCandidate(
    client: any,
    sessionId: string,
    eventName: string,
    startAt: Date
  ): Promise<boolean> {
    const waitlistRes = await client.query(`
      SELECT * FROM waitlists
      WHERE session_id = $1 AND status = 'waiting'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE
    `, [sessionId]);

    if (waitlistRes.rows.length === 0) return false;

    const waitItem = waitlistRes.rows[0];

    const waitHoldRes = await client.query(`
      INSERT INTO bookings (session_id, status, hold_expires_at, guest_name, guest_email)
      VALUES ($1, 'held', NOW() + INTERVAL '10 minutes', $2, $3)
      RETURNING id;
    `, [sessionId, waitItem.guest_name, waitItem.guest_email]);

    const waitHoldId = waitHoldRes.rows[0].id;

    await client.query(`
      UPDATE waitlists
      SET status = 'offered', hold_id = $1, offered_at = NOW()
      WHERE id = $2
    `, [waitHoldId, waitItem.id]);

    await client.query(`
      INSERT INTO notifications (type, payload, status)
      VALUES ('waitlist.offered', $1, 'pending')
    `, [JSON.stringify({
      waitlist_id: waitItem.id,
      session_id: sessionId,
      hold_id: waitHoldId,
      guest_name: waitItem.guest_name,
      guest_email: waitItem.guest_email,
      event_name: eventName,
      start_at: startAt.toISOString(),
      claim_ttl_minutes: 10,
    })]);

    return true;
  }
}
