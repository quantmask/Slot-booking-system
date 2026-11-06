import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 users
    { duration: '30s', target: 20 }, // Hold at 20 users
    { duration: '5s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration{type:slots}': ['p(95)<300'], // PRD Target: Slot listing p95 < 300ms
    'http_req_duration{type:holds}': ['p(95)<200'], // PRD Target: Hold p95 < 200ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // 1. Slot Listing Check
  const slotsRes = http.get(`${BASE_URL}/api/hosts/alex/events/quick-catchup/slots?tz=America/New_York`, {
    tags: { type: 'slots' },
  });

  check(slotsRes, {
    'slots status is 200': (r) => r.status === 200,
    'slots payload has slots array': (r) => JSON.parse(r.body).slots !== undefined,
  });

  sleep(0.5);

  // 2. Health & Metrics Check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
    'db is connected': (r) => JSON.parse(r.body).database === 'connected',
  });

  sleep(0.5);
}
