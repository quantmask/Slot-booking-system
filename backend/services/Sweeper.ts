import { pool } from '../config/db.js';
import { notifySlotsChanged } from '../lib/eventBus.js';

export class Sweeper {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs = 30000) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Sweeper] Started background hygiene cleanup.');

    const run = async () => {
      if (!this.isRunning) return;
      try {
        await this.sweepExpiredHolds();
      } catch (err) {
        console.error('[Sweeper] Error in sweep run:', err);
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(run, intervalMs);
        }
      }
    };

    this.timer = setTimeout(run, 1000);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[Sweeper] Stopped.');
  }

  async sweepExpiredHolds(): Promise<{ expiredBookings: number; releasedSessions: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updateRes = await client.query(`
        UPDATE bookings
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'held' AND hold_expires_at <= NOW()
        RETURNING id, session_id;
      `);

      const sessRes = await client.query(`
        UPDATE sessions s
        SET status = 'released'
        WHERE s.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.session_id = s.id
              AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))
          )
        RETURNING id;
      `);

      // Dispatch due reminders
      const dueRemindersRes = await client.query(`
        SELECT r.id, r.booking_id, r.reminder_type, b.guest_name, b.guest_email, s.start_at, et.name AS event_name
        FROM reminders r
        JOIN bookings b ON r.booking_id = b.id
        JOIN sessions s ON b.session_id = s.id
        JOIN event_types et ON s.event_type_id = et.id
        WHERE r.status = 'pending' AND r.scheduled_for <= NOW()
        FOR UPDATE SKIP LOCKED;
      `);

      for (const rem of dueRemindersRes.rows) {
        await client.query(`
          UPDATE reminders SET status = 'sent', sent_at = NOW() WHERE id = $1
        `, [rem.id]);

        await client.query(`
          INSERT INTO notifications (type, payload, status)
          VALUES ('reminder.sent', $1, 'pending')
        `, [JSON.stringify({
          reminder_id: rem.id,
          booking_id: rem.booking_id,
          reminder_type: rem.reminder_type,
          guest_name: rem.guest_name,
          guest_email: rem.guest_email,
          event_name: rem.event_name,
          start_at: rem.start_at.toISOString(),
        })]);
      }

      await client.query('COMMIT');
      if ((updateRes.rowCount || 0) > 0) {
        notifySlotsChanged();
      }
      return {
        expiredBookings: updateRes.rowCount || 0,
        releasedSessions: sessRes.rowCount || 0,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

