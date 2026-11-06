import { pool } from '../config/db.js';

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

      await client.query('COMMIT');
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

