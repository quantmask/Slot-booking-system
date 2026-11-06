import { pool, withTransaction } from '../config/db.js';
import { hashPassword } from '../lib/security.js';

export async function seedDatabase() {
  console.log('[Seeder] Starting database seed...');

  await withTransaction(async (client) => {
    // Upsert Host 'alex'
    const passwordHash = hashPassword('password123');
    const hostRes = await client.query(`
      INSERT INTO hosts (slug, email, password_hash, timezone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (slug) DO UPDATE 
      SET email = EXCLUDED.email, 
          password_hash = EXCLUDED.password_hash,
          timezone = EXCLUDED.timezone
      RETURNING id;
    `, ['alex', 'alex@example.com', passwordHash, 'America/New_York']);

    const hostId = hostRes.rows[0].id;
    console.log(`[Seeder] Seeded demo host 'alex' (${hostId})`);

    // Seed Event Types
    // 1. One-on-one (30 min, capacity 1, buffer 15 min after, min notice 4h, horizon 30d)
    await client.query(`
      INSERT INTO event_types (
        host_id, slug, name, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours, horizon_days
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (host_id, slug) DO UPDATE
      SET name = EXCLUDED.name,
          duration_min = EXCLUDED.duration_min,
          capacity = EXCLUDED.capacity,
          buffer_before_min = EXCLUDED.buffer_before_min,
          buffer_after_min = EXCLUDED.buffer_after_min,
          min_notice_hours = EXCLUDED.min_notice_hours,
          horizon_days = EXCLUDED.horizon_days,
          archived_at = NULL
      RETURNING id;
    `, [hostId, 'quick-catchup', 'Quick Catchup', 30, 1, 0, 15, 4, 30]);

    // 2. Group session (60 min, capacity 3, buffer 15 min before/after, min notice 24h, horizon 30d)
    await client.query(`
      INSERT INTO event_types (
        host_id, slug, name, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours, horizon_days
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (host_id, slug) DO UPDATE
      SET name = EXCLUDED.name,
          duration_min = EXCLUDED.duration_min,
          capacity = EXCLUDED.capacity,
          buffer_before_min = EXCLUDED.buffer_before_min,
          buffer_after_min = EXCLUDED.buffer_after_min,
          min_notice_hours = EXCLUDED.min_notice_hours,
          horizon_days = EXCLUDED.horizon_days,
          archived_at = NULL
      RETURNING id;
    `, [hostId, 'group-workshop', 'Group Workshop', 60, 3, 15, 15, 24, 30]);

    console.log('[Seeder] Seeded event types: quick-catchup, group-workshop');

    // Seed Weekly Availability: Mon-Fri (1 to 5) 09:00 - 17:00
    await client.query('DELETE FROM weekly_availability WHERE host_id = $1', [hostId]);
    for (let day = 1; day <= 5; day++) {
      await client.query(`
        INSERT INTO weekly_availability (host_id, weekday, start_time, end_time)
        VALUES ($1, $2, '09:00:00', '17:00:00')
      `, [hostId, day]);
    }
    console.log('[Seeder] Seeded weekly availability: Mon-Fri 09:00-17:00');

    // Seed Date Override: day off on 2026-11-20
    await client.query('DELETE FROM date_overrides WHERE host_id = $1', [hostId]);
    await client.query(`
      INSERT INTO date_overrides (host_id, date, is_off)
      VALUES ($1, '2026-11-20', TRUE)
    `, [hostId]);
    console.log('[Seeder] Seeded sample date override: 2026-11-20 (Full day off)');
  });

  console.log('[Seeder] Seeding completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seeder] Seeding failed:', err);
      process.exit(1);
    });
}

