import { pool } from '../db/pool.js';

export class OutboxWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.WEBHOOK_URL || 'http://127.0.0.1:3000/api/mock-webhook';
  }

  start(intervalMs = 2000) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[OutboxWorker] Started. Delivering events to: ${this.webhookUrl}`);

    const run = async () => {
      if (!this.isRunning) return;
      try {
        await this.processPendingEvents();
      } catch (err) {
        console.error('[OutboxWorker] Error processing events:', err);
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(run, intervalMs);
        }
      }
    };

    this.timer = setTimeout(run, 500);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[OutboxWorker] Stopped.');
  }

  /**
   * Process pending notifications using FOR UPDATE SKIP LOCKED.
   */
  async processPendingEvents(): Promise<number> {
    const client = await pool.connect();
    let processedCount = 0;

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(`
        SELECT id, type, payload, attempts, created_at
        FROM notifications
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED;
      `);

      for (const event of rows) {
        processedCount++;
        const deliveryPayload = {
          event_id: event.id,
          event_type: event.type,
          payload: event.payload,
          timestamp: event.created_at,
          attempt: event.attempts + 1,
        };

        try {
          const res = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Slotbook-Event-Id': event.id,
              'X-Slotbook-Event-Type': event.type,
            },
            body: JSON.stringify(deliveryPayload),
            signal: AbortSignal.timeout(3000),
          });

          if (res.ok) {
            await client.query(`
              UPDATE notifications
              SET status = 'delivered',
                  attempts = attempts + 1,
                  delivered_at = NOW()
              WHERE id = $1;
            `, [event.id]);
          } else {
            throw new Error(`Webhook responded with status ${res.status}`);
          }
        } catch (err: any) {
          // Calculate exponential backoff: 2s, 4s, 8s, 16s... max 60s
          const backoffSec = Math.min(Math.pow(2, event.attempts + 1), 60);
          await client.query(`
            UPDATE notifications
            SET attempts = attempts + 1,
                next_attempt_at = NOW() + ($1 || ' seconds')::interval,
                status = CASE WHEN attempts + 1 >= 10 THEN 'failed' ELSE 'pending' END
            WHERE id = $2;
          `, [backoffSec, event.id]);
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return processedCount;
  }
}
