import { buildServer } from '../src/api/server.js';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { DateTime } from 'luxon';

function calculatePercentiles(latencies: number[]) {
  if (latencies.length === 0) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p: number) => sorted[Math.floor(sorted.length * p)];
  const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;

  return {
    min: sorted[0],
    p50: getP(0.50),
    p90: getP(0.90),
    p95: getP(0.95),
    p99: getP(0.99),
    max: sorted[sorted.length - 1],
    avg: parseFloat(avg.toFixed(2)),
  };
}

async function runLoadBenchmark() {
  console.log('====================================================');
  console.log('  Slotbook Performance Benchmark (k6 equivalent)    ');
  console.log('====================================================\n');

  await runMigrations();
  await seedDatabase();

  const app = buildServer();
  await app.ready();

  // Test 1: Slot Listing Benchmark (Target: p95 < 300 ms)
  console.log('[Benchmark 1] Running 100 concurrent slot listing requests...');
  const slotLatencies: number[] = [];
  const startListing = Date.now();

  const listingPromises = Array.from({ length: 100 }, async () => {
    const t0 = performance.now();
    const res = await app.inject({
      method: 'GET',
      url: '/api/hosts/alex/events/quick-catchup/slots?tz=America/New_York',
    });
    const t1 = performance.now();
    slotLatencies.push(t1 - t0);
    if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
  });

  await Promise.all(listingPromises);
  const totalListingTime = (Date.now() - startListing) / 1000;
  const listingStats = calculatePercentiles(slotLatencies);

  console.log('--- Slot Listing Results ---');
  console.log(`Requests completed: 100 in ${totalListingTime.toFixed(2)}s (${(100 / totalListingTime).toFixed(1)} req/s)`);
  console.log(`Latency: avg=${listingStats.avg}ms, p50=${listingStats.p50.toFixed(2)}ms, p95=${listingStats.p95.toFixed(2)}ms, p99=${listingStats.p99.toFixed(2)}ms`);
  console.log(`Target: p95 < 300 ms -> ${listingStats.p95 < 300 ? 'PASSED (PASS)' : 'FAILED'}\n`);

  // Test 2: Hold Placement Benchmark (Target: p95 < 200 ms)
  console.log('[Benchmark 2] Running 50 distinct slot hold requests...');
  const holdLatencies: number[] = [];
  const startHolds = Date.now();

  // Generate 50 distinct future slot dates/times
  const holdPromises = Array.from({ length: 50 }, async (_, i) => {
    // Generate valid slot time
    const dayOffset = Math.floor(i / 8) + 2;
    const hour = 9 + (i % 8);
    const slotStart = DateTime.utc().plus({ days: dayOffset }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toISO()!;

    const t0 = performance.now();
    const res = await app.inject({
      method: 'POST',
      url: '/api/holds',
      headers: { 'idempotency-key': `load-hold-${i}-${Date.now()}` },
      payload: {
        hostSlug: 'alex',
        eventSlug: 'quick-catchup',
        slotStart,
      },
    });
    const t1 = performance.now();
    holdLatencies.push(t1 - t0);
  });

  await Promise.all(holdPromises);
  const totalHoldTime = (Date.now() - startHolds) / 1000;
  const holdStats = calculatePercentiles(holdLatencies);

  console.log('--- Hold Placement Results ---');
  console.log(`Requests completed: 50 in ${totalHoldTime.toFixed(2)}s (${(50 / totalHoldTime).toFixed(1)} req/s)`);
  console.log(`Latency: avg=${holdStats.avg}ms, p50=${holdStats.p50.toFixed(2)}ms, p95=${holdStats.p95.toFixed(2)}ms, p99=${holdStats.p99.toFixed(2)}ms`);
  console.log(`Target: p95 < 200 ms -> ${holdStats.p95 < 200 ? 'PASSED (PASS)' : 'FAILED'}\n`);

  await app.close();
  await pool.end();
}

runLoadBenchmark().catch(console.error);
