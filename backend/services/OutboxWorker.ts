import crypto from 'crypto';
import { pool } from '../config/db.js';

export class OutboxWorker {
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private webhookUrl: string;
  private maxAttempts: number;

  constructor(webhookUrl?: string, maxAttempts = 5) {
    this.webhookUrl = webhookUrl || process.env.WEBHOOK_URL || 'http://127.0.0.1:3000/api/mock-webhook';
    this.maxAttempts = maxAttempts;
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
          const idempotencyKey = (event.payload && typeof event.payload === 'object' && event.payload.idempotency_key)
            ? String(event.payload.idempotency_key)
            : event.id;

          const res = await fetch(this.webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Slotbook-Event-Id': event.id,
              'X-Slotbook-Event-Type': event.type,
              'X-Slotbook-Delivery-Attempt': String(event.attempts + 1),
              'X-Slotbook-Idempotency-Key': idempotencyKey,
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

            // Optional Extension: Dispatch signed HMAC webhooks to registered host endpoints
            try {
              const bookingId = event.payload && typeof event.payload === 'object' ? event.payload.booking_id : null;
              if (bookingId) {
                const hostHooksRes = await client.query(`
                  SELECT hw.id, hw.host_id, hw.url, hw.secret_key
                  FROM host_webhooks hw
                  JOIN sessions s ON s.host_id = hw.host_id
                  JOIN bookings b ON b.session_id = s.id
                  WHERE b.id = $1 AND hw.is_active = TRUE
                `, [bookingId]);

                for (const hook of hostHooksRes.rows) {
                  const hookPayloadStr = JSON.stringify(deliveryPayload);
                  const signature = crypto.createHmac('sha256', hook.secret_key).update(hookPayloadStr).digest('hex');
                  const startDelivery = Date.now();
                  let statusCode: number | null = null;
                  let errMsg: string | null = null;

                  try {
                    const hookRes = await fetch(hook.url, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-Slotbook-Event-Id': event.id,
                        'X-Slotbook-Event-Type': event.type,
                        'X-Slotbook-Signature': `sha256=${signature}`,
                      },
                      body: hookPayloadStr,
                      signal: AbortSignal.timeout(3000),
                    });
                    statusCode = hookRes.status;
                  } catch (hErr: any) {
                    errMsg = hErr.message;
                  }

                  const duration = Date.now() - startDelivery;
                  await client.query(`
                    INSERT INTO webhook_logs (host_id, event_id, event_type, url, status_code, error_message, delivery_duration_ms)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                  `, [hook.host_id, event.id, event.type, hook.url, statusCode, errMsg, duration]);
                }
              }
            } catch {
              // Non-blocking for host webhooks
            }
          } else {
            throw new Error(`Webhook responded with status ${res.status}`);
          }
        } catch (err: any) {
          const backoffSec = Math.min(Math.pow(2, event.attempts + 1), 60);
          await client.query(`
            UPDATE notifications
            SET attempts = attempts + 1,
                next_attempt_at = NOW() + ($1 || ' seconds')::interval,
                status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END
            WHERE id = $3;
          `, [backoffSec, this.maxAttempts, event.id]);
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

