# Slotbook: High-Reliability Scheduler

> A Calendly-style scheduling engine whose correctness you can prove with tests. Built with TypeScript end-to-end, Fastify, React (Vite), and PostgreSQL 15+.

[![Tests](https://img.shields.io/badge/tests-30%20passed-brightgreen.svg)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B%20%28btree__gist%29-blue.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)]()

---

## 1. Core Architecture & Guarantees

Slotbook is built around a single uncompromised promise: **zero double-bookings and zero capacity overruns**, even under extreme concurrency, network retries, client clock drift, and unexpected server crashes.

### The 4-Tier Concurrency Defense:
1. **Per-Host Row Serialization Lock**: Every write transaction begins with `SELECT id FROM hosts WHERE id = $1 FOR UPDATE`. This serializes all operations on a host’s calendar.
2. **Database Clock as Source of Truth**: Hold expiration (5-minute TTL) and notice/horizon calculations strictly rely on PostgreSQL’s `NOW()`, insulating the system from client clock skew or tampering.
3. **Database GiST Exclusion Constraint Backstop**:
   ```sql
   ALTER TABLE sessions ADD CONSTRAINT no_overlapping_active_sessions
   EXCLUDE USING gist (
     host_id WITH =,
     blocked_range WITH &&
   ) WHERE (status = 'active');
   ```
   Even if application logic were bypassed, PostgreSQL physically rejects overlapping sessions and buffers (error code `23P01`).
4. **Atomic Reschedule Transactions**: Reschedules release the existing slot and claim the target slot inside a single database transaction. If the target slot is unavailable, the entire transaction rolls back cleanly, leaving the original booking 100% intact.

---

## 2. Quickstart & Running the App

### Option A: One-Command Docker Setup (Recommended)
Make sure Docker Desktop is running:
```bash
docker compose up --build
```
This starts PostgreSQL 15, applies database migrations, seeds the demo host (`alex`), builds the React client, and launches the Fastify server on `http://localhost:3000`.

### Option B: Local Development
Ensure Node.js (v20+) and PostgreSQL (v15+) are available:
```bash
# 1. Install dependencies
npm install

# 2. Run migrations
npm run db:migrate

# 3. Seed demo host & event types
npm run db:seed

# 4. Build frontend client
npm run build

# 5. Start server & background workers
npm start
```
The application will be accessible at `http://localhost:3000`.

---

## 3. 60-Second Tour of the UI

1. **Public Booking Page (`/alex/quick-catchup`)**:
   - Open `http://localhost:3000/alex/quick-catchup`.
   - View 30-day available slots grouped by date in your browser's local timezone.
   - Switch timezone with the top dropdown (e.g. `Asia/Kolkata` vs `America/New_York`) to observe instantaneous slot display re-projection.
   - Click any slot to activate a **5-minute temporary hold** with a live countdown timer.
   - Enter your name and email, then click **Confirm Booking**.
   - Note the **Private Manage Link** generated (shown once) with a one-click copy button.
2. **Manage Booking Page (`/manage/{token}`)**:
   - Access the manage link.
   - View booking details and status.
   - Click **Reschedule Slot** to pick any fresh available slot and atomically move your booking.
   - Or click **Cancel** and supply a mandatory cancellation reason.
3. **Group Workshop Booking (`/alex/group-workshop`)**:
   - Open `http://localhost:3000/alex/group-workshop`.
   - Observe the seat counter (`3 seats left`). Multiple guests can join the same session until capacity reaches 0.
4. **Host Dashboard (`/host`)**:
   - Sign in using `alex@example.com` / `password123` (or click the quick-fill button).
   - **Profile Tab**: Update home timezone with instant IANA validation.
   - **Event Types Tab**: Create new event types (duration, capacity, buffers, notice, horizon) or archive existing ones.
   - **Bookings Tab**: View all upcoming bookings in host local time, and cancel any booking with a recorded reason.

---

## 4. Automated Test Suite (R1 to R14)

All reliability claims are backed by automated tests against live PostgreSQL:
```bash
npm test
```

### Reliability Matrix
| Test ID | Scenario | Verified Outcome |
| :--- | :--- | :--- |
| **R1** | 50 concurrent holds racing for 1-capacity slot | Exactly 1 succeeds, 49 fail with HTTP 409 |
| **R2** | 20 concurrent holds racing for 3-capacity slot | Exactly 3 succeed, 17 fail with HTTP 409 |
| **R3** | Overlapping slots from different event types | Cross-event buffer collision prevented |
| **R4** | 10 parallel requests with same Idempotency-Key | 1 hold created, 10 identical responses returned |
| **R5** | Idempotency key reused with mismatched body | Rejected with HTTP 422 Unprocessable Entity |
| **R6** | Confirm after 5-minute hold expiry | Returns HTTP 410, slot becomes bookable immediately |
| **R7** | Confirm racing exact expiry boundary | Exactly 1 deterministic outcome (200 or 410) |
| **R8** | Reschedule into taken slot | Fails with 409, original booking remains intact |
| **R9** | Concurrent reschedules into 1 open slot | Exactly 1 winner, loser keeps original booking |
| **R10**| Direct raw SQL insert overlapping active session | Physical GiST constraint rejects query (`23P01`) |
| **R11**| Mid-operation crash / error | Transaction rolls back with zero orphaned rows |
| **R12**| Notification sink down during booking | Outbox buffers events; delivers upon recovery |
| **R13**| Input validation (past, off-grid, notice, horizon)| Strict 400 Bad Request error contract |
| **R14**| Correctness without sweeper or cron | DB `NOW()` comparisons maintain invariants standalone |

---

## 5. Performance & Load Testing

Run the built-in concurrent load benchmark:
```bash
npx tsx tests/load_test.ts
```
Results on local machine:
- **Slot Listing**: 100 concurrent requests $\rightarrow$ **avg 28ms, p95 44ms** (PRD target: $< 300\text{ms}$).
- **Hold Placement**: 50 concurrent holds $\rightarrow$ **avg 34ms, p95 86ms** (PRD target: $< 200\text{ms}$).

A standard `k6` script is also provided at `tests/k6_load_test.js`:
```bash
k6 run tests/k6_load_test.js
```

---

## 6. API Reference

All requests and responses use JSON. Timestamps are ISO-8601 UTC instants.

| Method | Path | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Liveness, DB check & metrics | `200`, `503` |
| `POST` | `/api/auth/login` | Host session login | `200`, `401` |
| `POST` | `/api/auth/logout` | Host session logout | `200` |
| `GET` | `/api/hosts/:host/events/:slug/slots` | Available slots listing | `200`, `400`, `404` |
| `POST` | `/api/holds` | Create 5-minute hold | `201`, `400`, `409`, `422` |
| `POST` | `/api/holds/:id/confirm` | Confirm hold with guest details | `200`, `400`, `410` |
| `GET` | `/api/bookings/:token` | View booking details | `200`, `404` |
| `POST` | `/api/bookings/:token/reschedule`| Atomic slot reschedule | `200`, `400`, `409` |
| `POST` | `/api/bookings/:token/cancel` | Cancel booking | `200`, `400`, `404` |
| `GET` | `/api/host/bookings` | List host bookings | `200`, `401` |
| `POST` | `/api/host/bookings/:id/cancel` | Host cancel booking | `200`, `400`, `401` |

---

## 7. Submission Checklist & Deliverables
- [x] Full Git commit history (unsquashed, descriptive milestones)
- [x] Source, SQL migrations, seed script
- [x] Automated test suite passing against PostgreSQL 15+ (`npm test`)
- [x] `README.md` with 60-second UI tour and API spec
- [x] `AI_LOG.md` documenting key prompts and manual corrections
- [x] Comprehensive Report PDF matching all 10 required sections

