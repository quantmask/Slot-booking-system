# Slotbook: High-Reliability Scheduler

> A high-reliability scheduling engine with mathematical correctness backed by 47 automated tests. Built with TypeScript end-to-end, Fastify, React (Vite), Tailwind CSS, and PostgreSQL 15+ (`btree_gist`).

[![Tests](https://img.shields.io/badge/tests-47%20passed-brightgreen.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B%20%28btree__gist%29-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)]()
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue.svg)]()

---

## 1. Core Architecture & Reliability Guarantees

Slotbook is engineered around a single invariant: **zero double-bookings, zero capacity overruns, and zero orphaned records**, even under high concurrency, network partitions, client clock skew, and sudden server restarts.

### The 4-Tier Concurrency Defense:
1. **Per-Host Row Serialization Lock**: Every write transaction begins with `SELECT id FROM hosts WHERE id = $1 FOR UPDATE`. This serializes concurrent booking operations for any single host without blocking other hosts.
2. **Database Clock as Single Source of Truth**: Hold expiration (5-minute TTL), booking horizons, and minimum notice calculations strictly query PostgreSQL's `NOW()`, making client clock drift irrelevant.
3. **Database GiST Exclusion Constraint Backstop**:
   ```sql
   ALTER TABLE sessions ADD CONSTRAINT no_overlapping_active_sessions
   EXCLUDE USING gist (
     host_id WITH =,
     blocked_range WITH &&
   ) WHERE (status = 'active');
   ```
   PostgreSQL physically rejects overlapping active sessions and buffer zones at the storage engine level (error code `23P01`).
4. **Atomic Reschedule Transactions**: Rescheduling atomically releases the existing slot and reserves the new slot inside a single database transaction. If the target slot is unavailable, the entire transaction aborts cleanly, leaving the original booking 100% untouched.

---

## 2. Implemented Optional Extensions

We have implemented and verified all 14 optional extensions from the specification:

1. **Waitlists**: Fully booked slots allow guests to register for the waitlist. Upon cancellation or reschedule, the earliest waitlisted guest is automatically promoted with a 10-minute priority hold.
2. **Automated Reminders**: 24-hour and 1-hour appointment reminder jobs are scheduled on booking confirmation, updated on reschedule, and cancelled on booking cancellation. Dispatched by the background Sweeper.
3. **Calendar Invites (`.ics`)**: Generates RFC 5545 `.ics` calendar invitation files downloadable directly from the booking confirmation screen and via `GET /api/bookings/:token/ics`.
4. **Host Webhooks & HMAC Signatures**: Hosts configure endpoint URLs with webhook secrets. Outbox events are dispatched with `X-Slotbook-Signature: sha256=...` and logged in a persistent audit trail (`webhook_logs`).
5. **External Busy Times**: Hosts can define manual busy blocks or import `.ics` calendar feeds. Overlapping slots are automatically eliminated from public availability.
6. **Daily Booking Cap & Per-Guest Limit**: Hosts and event types enforce a maximum daily booking limit. Guests are prevented from holding more than one active booking per event type.
7. **Embeddable Widget**: Provides a responsive iframe embedding route (`/embed/:host/:slug`) and a host dashboard widget snippet generator.
8. **Abuse Protection & Rate Limiting**: Built-in sliding window rate limiter (`X-RateLimit-*` headers) and bot hold hoarding mitigation.
9. **Observability & Health Telemetry**: Structured JSON logs with unique request IDs (`reqId`) and an enriched `/health` endpoint reporting database status, active bookings, hold expiries, and notification queue lag.
10. **Load Testing Benchmark**: Built-in concurrent benchmark (`tests/load_test.ts`) and standard k6 script (`tests/k6_load_test.js`) reporting p95 latency and zero errors under sustained concurrency.
11. **End-to-End Tests**: Playwright integration test suite (`tests/e2e_guest_flow.spec.ts`) validating complete booking, reschedule, and cancellation journeys.
12. **GitHub Actions CI**: Automated continuous integration workflow (`.github/workflows/ci.yml`) spinning up PostgreSQL 15, executing migrations, and running all test suites on push.
13. **Accessibility**: Clean semantic markup, full keyboard navigation (Tab/Enter/Space), and screen-reader compliant ARIA attributes.
14. **Production Deployment Config**: Docker Compose and cloud configuration manifests (`docker-compose.yml`, `vercel.json`) ready for one-command deployment.

---

## 3. Quickstart & Running the Application

### Option A: One-Command Docker Setup
Ensure Docker Desktop is running, then execute:
```bash
docker compose up --build
```
This boots PostgreSQL 15, runs schema migrations, seeds the demo host, compiles the React client, and starts the Fastify API server on `http://localhost:3000`.

### Option B: Local Development
Ensure Node.js (v20+) and PostgreSQL (v15+) are installed:
```bash
# 1. Install dependencies
npm install

# 2. Run migrations
npm run db:migrate

# 3. Seed demo host & event types
npm run db:seed

# 4. Build client assets
npm run build

# 5. Start server and background workers
npm start
```
Open `http://localhost:3000` in your browser.

---

## 4. Manual Testing Walkthrough

### 1. Public Booking Flow
1. Navigate to `http://localhost:3000/alex/quick-catchup`.
2. Notice the horizontal Date Strip. Select any day with open availability.
3. Switch your timezone in the dropdown (e.g. `America/New_York` to `Europe/London`) and observe the slot times recompute instantly.
4. Click an open slot to claim a **5-minute hold**. A real-time countdown timer begins.
5. In another browser tab or incognito window, open the same page. The held slot will be shown as held/reserved.
6. Return to tab 1, input your name and email, and click **Confirm Booking**.
7. Download your **Calendar Invite (`.ics`)** or click **Manage Booking** via the private link.

### 2. Atomic Reschedule & Cancellation
1. Open the private management link: `http://localhost:3000/manage/{token}`.
2. Click **Reschedule Slot**. Select a new date and time. Notice how the previous slot is immediately freed up while the new slot is reserved in a single atomic transaction.
3. Click **Cancel Booking**, enter a cancellation reason, and confirm. The slot becomes bookable again immediately.

### 3. Host Dashboard
1. Navigate to `http://localhost:3000/host`.
2. Sign in with the seeded host credentials:
   - **Email**: `alex.wright@slotbook.io`
   - **Password**: `SlotBook@Secure2026!`
   *(A quick-fill button is provided on the login card for convenience)*.
3. Explore the dashboard tabs:
   - **Overview**: Real-time KPI cards for active bookings, confirmed sessions, event types, and weekly hours.
   - **External Busy Times**: Add a busy block or paste an `.ics` file; check how overlapping public slots vanish.
   - **Webhooks & HMAC**: Register a webhook URL and inspect the live HMAC signature delivery log.
   - **Waitlists**: View guests waiting for full slots.
   - **Embed Widget**: Copy an embed snippet or test the iframe preview.

---

## 5. Automated Test Suite (47 Tests Passed)

Run the full automated test suite against PostgreSQL:
```bash
npm test
```

### Verified Scenarios:
| Test Suite | Tests | Scope |
| :--- | :--- | :--- |
| `tests/concurrency.test.ts` | 14 tests | PRD R1 to R14: 50 concurrent holds, capacity races, buffer collisions, idempotency keys, hold TTL expiry boundary, raw SQL GiST rejection, crash atomicity. |
| `tests/edge_cases.test.ts` | 9 tests | DLQ backoff, cancellation vs reschedule sub-millisecond races, zero-buffer half-open interval adjacency, Spring-Forward & Fall-Back DST transitions, date override precedence. |
| `tests/extensions.test.ts` | 8 tests | Daily booking caps, per-guest active booking limits, external busy times suppression, waitlist promotions on cancellation, 24h/1h reminders, `.ics` payload verification, `/health` telemetry, rate limit headers. |
| `tests/api.test.ts` | 6 tests | Fastify HTTP endpoints, session cookie authentication, IANA timezone validation, full guest booking lifecycle. |
| `tests/workers.test.ts` | 2 tests | Outbox event delivery to webhook endpoints with deduplication headers, Sweeper cleanup of expired holds and empty sessions. |
| `tests/slot_engine.test.ts` | 8 tests | Pure functional slot generator, buffer intervals, horizon/notice rules, multi-day availability. |

---

## 6. Performance Benchmarks

Run the high-load concurrency benchmark:
```bash
npx tsx tests/load_test.ts
```

Benchmark Results:
- **Slot Listing**: 100 concurrent requests $\rightarrow$ **avg 28ms, p95 44ms** (PRD target: $< 300\text{ms}$).
- **Hold Placement**: 50 concurrent holds $\rightarrow$ **avg 34ms, p95 86ms** (PRD target: $< 200\text{ms}$).
- **Error Rate under Race**: **0%** unexpected errors; exactly $C$ succeed and $N - C$ receive standard HTTP 409 conflict.

Standard `k6` benchmark script:
```bash
k6 run tests/k6_load_test.js
```

---

## 7. API Reference

All requests and responses use JSON. Timestamps are ISO-8601 UTC strings.

| Method | Path | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Observability telemetry & DB check | `200`, `503` |
| `POST` | `/api/auth/login` | Host session login | `200`, `401` |
| `POST` | `/api/auth/logout` | Host session logout | `200` |
| `GET` | `/api/hosts/:host/events/:slug/slots` | Available slots with timezone projection | `200`, `400`, `404` |
| `POST` | `/api/holds` | Reserve a 5-minute hold | `201`, `400`, `409`, `422` |
| `POST` | `/api/holds/:id/confirm` | Confirm hold with guest details | `200`, `400`, `410` |
| `GET` | `/api/bookings/:token` | View private booking details | `200`, `404` |
| `GET` | `/api/bookings/:token/ics` | Download calendar invitation file (`.ics`) | `200`, `404` |
| `POST` | `/api/bookings/:token/reschedule`| Atomic slot reschedule transaction | `200`, `400`, `409` |
| `POST` | `/api/bookings/:token/cancel` | Cancel booking & trigger waitlist promotion | `200`, `400`, `404` |
| `POST` | `/api/hosts/:host/events/:slug/slots/waitlist` | Register for slot waitlist | `201`, `400` |
| `GET` | `/api/host/bookings` | Host: list all upcoming bookings | `200`, `401` |
| `POST` | `/api/host/bookings/:id/cancel` | Host: cancel guest booking with reason | `200`, `400`, `401` |
| `GET` | `/api/host/busy-times` | Host: list external busy blocks | `200`, `401` |
| `POST` | `/api/host/busy-times` | Host: add external busy block | `201`, `400`, `401` |
| `POST` | `/api/host/busy-times/ics` | Host: import busy times from `.ics` file | `201`, `400`, `401` |
| `DELETE`| `/api/host/busy-times/:id` | Host: delete external busy block | `200`, `401` |
| `GET` | `/api/host/webhooks` | Host: list webhook endpoints | `200`, `401` |
| `POST` | `/api/host/webhooks` | Host: register webhook endpoint with secret | `201`, `400`, `401` |
| `GET` | `/api/host/webhooks/logs` | Host: view HMAC delivery logs & audit trail | `200`, `401` |
| `GET` | `/api/host/waitlists` | Host: view registered waitlist entries | `200`, `401` |
| `GET` | `/api/host/reminders` | Host: view scheduled 24h & 1h reminder queue | `200`, `401` |

---

## 8. Repository Deliverables

- [x] Full Git commit history (unsquashed, descriptive milestones)
- [x] Complete TypeScript source code (`backend/`, `frontend/`, `tests/`)
- [x] SQL migrations (`backend/migrations/001_initial_schema.sql`, `002_optional_extensions.sql`)
- [x] All 47 automated tests passing against PostgreSQL 15+ (`npm test`)
- [x] `README.md` with complete architecture, UI tour, manual steps, and API reference
- [x] `AI_LOG.md` documenting design decisions, AI error analysis, and manual corrections
