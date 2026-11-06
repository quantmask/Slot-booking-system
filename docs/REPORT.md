# Slotbook: High-Reliability Scheduling Engine
## Architecture, Concurrency Engineering & Verification Report

**Author**: Engineering Team  
**Date**: November 6, 2026  
**Document Version**: 1.0  
**Repository**: [Slot-Book (GitHub)](https://github.com/example/slot-book)  

---

## Table of Contents
1. Links & Deployment
2. System Architecture & Request Lifecycle
3. Data Model & PostgreSQL Schema
4. Key Technical Decisions & Evaluated Trade-offs
5. Reliability Engineering & Failure Modes (R1–R14 Proofs)
6. Time Zones & Daylight Saving Time (DST) Transitions
7. Optional Extensions Built & Integration
8. Testing Methodology & Load Test Performance Metrics
9. Working with AI: Insights, Pitfalls & Human Oversight
10. Known Gaps, Limitations & Next Steps

---

## 1. Links & Deployment

- **Repository**: Public GitHub Repository containing full, unsquashed commit history tracking each phase of development.
- **Docker Compose**: Single-command startup (`docker compose up --build`) provisioning PostgreSQL 15, applying all schema migrations, seeding the demo environment, and launching the Fastify API and React web application.
- **Demo Seed Credentials**:
  - Host Email: `alex@example.com`
  - Password: `password123`
  - Timezone: `America/New_York`
  - Event Types: `quick-catchup` (30m, 1-on-1, 15m buffer) and `group-workshop` (60m, capacity 3, 15m buffer)

---

## 2. System Architecture & Request Lifecycle

Slotbook is structured as a modular TypeScript monolith separating public ingress, transactional scheduling logic, physical database constraints, and asynchronous background dispatchers.

```
+----------------------------------------------------------------------------------+
|                                CLIENT SURFACES                                   |
|  [Guest Booking Page]             [Manage Booking]            [Host Dashboard]   |
+----------------------------------------------------------------------------------+
                                        │ (HTTP / JSON)
                                        ▼
+----------------------------------------------------------------------------------+
|                            FASTIFY API & ROUTING                                 |
|  - Request ID Injection (Pino)          - Zod Schema Validation                  |
|  - Session Cookie Authentication        - Idempotency-Key Pre-Filter             |
+----------------------------------------------------------------------------------+
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
+───────────────────────────────────────+   +──────────────────────────────────────+
|          SLOT GENERATOR ENGINE        |   |           BOOKING SERVICE            |
|  - Luxon IANA Date Stepping           |   |  - Host-Level Lock (FOR UPDATE)      |
|  - DST Spring/Fall Disambiguation     |   |  - DB now() Clock Comparison         |
|  - Working Window & Override Slicing  |   |  - Lazy Session Management           |
|  - Buffer Conflict Filtering          |   |  - Transactional Outbox Emitter      |
+───────────────────────────────────────+   +──────────────────────────────────────+
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        ▼
+----------------------------------------------------------------------------------+
|                            POSTGRESQL 15+ STORAGE                                |
|  - hosts (Row serialization)         - sessions (GiST Exclusion Constraint)      |
|  - bookings (Holds & Confirmations)  - idempotency_keys (Payload Hash Cache)     |
|  - notifications (Transactional Outbox Queue)                                    |
+----------------------------------------------------------------------------------+
                                        │
                                        ▼
+──────────────────────────────────────────────────────────────────────────────────+
|                             BACKGROUND WORKERS                                   |
|  [Outbox Worker] (FOR UPDATE SKIP LOCKED) ──> Webhook Sink (At-least-once)       |
|  [Sweeper Worker] (Hygiene TTL Expiry)                                           |
+──────────────────────────────────────────────────────────────────────────────────+
```

### Complete Booking Request Lifecycle (Hold -> Confirm -> Reschedule)
1. **Hold Request (`POST /api/holds`)**:
   - The guest selects a candidate slot on `/:host/:slug`.
   - The client submits `hostSlug`, `eventSlug`, `slotStart`, and an `Idempotency-Key` header.
   - The engine checks `idempotency_keys` for a matching payload hash. If matched, the previously generated hold is returned immediately (R4). If the key is reused with a different payload, HTTP 422 is returned (R5).
   - In a transaction, the server executes `SELECT id FROM hosts WHERE id = $1 FOR UPDATE`. This serializes all writes on this host.
   - The engine checks capacity using DB `NOW()`. If existing active bookings (`status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW())`) satisfy capacity, a new hold row is inserted with `hold_expires_at = NOW() + INTERVAL '5 minutes'`.
   - The transaction commits, returning the hold ID and a 5-minute countdown timestamp.
2. **Confirm Request (`POST /api/holds/:id/confirm`)**:
   - Guest provides name and email.
   - Inside a host-locked transaction, the system verifies `hold_expires_at > NOW()`. If expired, the booking is marked `expired` and HTTP 410 Gone is returned (R6).
   - A cryptographically secure 256-bit manage token is generated. Its SHA-256 hash is saved to the database.
   - An event `booking.confirmed` is inserted into `notifications` in the exact same transaction.
   - The plain manage token is returned to the guest (shown once).
3. **Manage & Atomic Reschedule (`POST /api/bookings/:token/reschedule`)**:
   - Guest requests a new slot.
   - In a single host-locked transaction, the system verifies new slot availability.
   - The booking's session foreign key is updated to the new session, the old session is evaluated and marked `released` if empty, and `booking.rescheduled` is enqueued in the outbox.
   - If the new slot is unavailable or buffer conflicts arise, the transaction aborts cleanly, ensuring the guest is never left with zero or two bookings (R8).

---

## 3. Data Model & PostgreSQL Schema

The data model uses explicit foreign keys, check constraints, and range exclusion indexing to enforce business invariants at the database engine level.

```mermaid
erDiagram
    hosts ||--o{ event_types : owns
    hosts ||--o{ weekly_availability : defines
    hosts ||--o{ date_overrides : defines
    hosts ||--o{ sessions : hosts
    event_types ||--o{ sessions : instantiates
    sessions ||--o{ bookings : contains
    hosts ||--o{ notifications : triggers

    hosts {
        uuid id PK
        text slug UK
        text email UK
        text password_hash
        text timezone
        timestamptz created_at
    }

    event_types {
        uuid id PK
        uuid host_id FK
        text slug
        text name
        int duration_min
        int capacity
        int buffer_before_min
        int buffer_after_min
        int min_notice_hours
        int horizon_days
        timestamptz archived_at
    }

    weekly_availability {
        uuid id PK
        uuid host_id FK
        smallint weekday
        time start_time
        time end_time
    }

    date_overrides {
        uuid id PK
        uuid host_id FK
        date date
        boolean is_off
        time start_time
        time end_time
    }

    sessions {
        uuid id PK
        uuid host_id FK
        uuid event_type_id FK
        timestamptz start_at
        timestamptz end_at
        tstzrange blocked_range
        int capacity
        text status
    }

    bookings {
        uuid id PK
        uuid session_id FK
        text status
        timestamptz hold_expires_at
        text guest_name
        text guest_email
        text token_hash UK
        text cancel_reason
        timestamptz created_at
        timestamptz updated_at
    }

    idempotency_keys {
        text key PK
        uuid host_id
        text request_hash
        int status_code
        jsonb response_body
        timestamptz created_at
    }

    notifications {
        uuid id PK
        text type
        jsonb payload
        text status
        int attempts
        timestamptz next_attempt_at
        timestamptz delivered_at
        timestamptz created_at
    }
```

### Key Table Schemas and Physical Constraints

1. **`sessions` Table**:
   - `blocked_range`: `TSTZRANGE` representing `[start_at - buffer_before, end_at + buffer_after)`.
   - **GiST Exclusion Constraint**:
     ```sql
     CONSTRAINT no_overlapping_active_sessions EXCLUDE USING gist (
         host_id WITH =,
         blocked_range WITH &&
     ) WHERE (status = 'active');
     ```
     Enforces that no two active sessions for the same host may ever overlap in their blocked ranges.
   - **Unique Slot Index**:
     ```sql
     CREATE UNIQUE INDEX uq_active_session_slot 
     ON sessions (event_type_id, start_at) 
     WHERE (status = 'active');
     ```
     Guarantees that group events share exactly one physical session per scheduled start time.

2. **`bookings` Table**:
   - Statuses: `'held'`, `'confirmed'`, `'cancelled'`, `'expired'`.
   - **State Integrity Check**:
     ```sql
     CONSTRAINT chk_booking_status_fields CHECK (
         (status = 'held' AND hold_expires_at IS NOT NULL) OR
         (status = 'confirmed' AND guest_name IS NOT NULL AND guest_email IS NOT NULL AND token_hash IS NOT NULL) OR
         (status = 'cancelled' AND cancel_reason IS NOT NULL) OR
         (status = 'expired')
     );
     ```

3. **`idempotency_keys` Table**:
   - Primary key on `key`. Stores `request_hash = sha256(payload)`, `status_code`, and cached `response_body`.

4. **`notifications` Table (Transactional Outbox)**:
   - Stores outbox event records created in the same database transaction as booking state transitions.

---

## 4. Key Technical Decisions & Evaluated Trade-offs

| Decision | Chosen Solution | Alternative Considered | Justification |
| :--- | :--- | :--- | :--- |
| **1. Concurrency Control** | Host-level row locking (`SELECT id FROM hosts ... FOR UPDATE`) | Distributed Redis locks (Redlock) or Optimistic Locking | Redis introduces external failure modes, network partitions, and split-brain risks. Host-level serialization in PostgreSQL guarantees strict serializability per host with zero external infrastructure. |
| **2. Double-Booking Backstop** | PostgreSQL `btree_gist` exclusion constraint | Application-level validation only | Application-only validation is vulnerable to software bugs, isolation level anomalies, or concurrent race windows. GiST physically rejects overlapping range inserts at the storage engine level. |
| **3. Clock Authority** | PostgreSQL `NOW()` / `CURRENT_TIMESTAMP` | Node.js application server clock | Distributed application servers experience NTP drift. Centralizing all TTL calculations on the database clock ensures exact 5-minute expirations regardless of client or server clock discrepancies. |
| **4. Group Session Representation** | Lazy Session Rows with Child Bookings | Flattened booking records with duplicated ranges | Having individual bookings share a parent `session` row allows atomic capacity counts (`COUNT(bookings) < capacity`) while maintaining the single GiST exclusion constraint on the session range. |
| **5. Notification Reliability** | Transactional Outbox Table + Polling Worker with `SKIP LOCKED` | Direct inline HTTP webhook call during booking transaction | Direct HTTP calls inside database transactions introduce severe latency, risk transaction timeouts, and break ACID guarantees if the sink is down. Outbox guarantees at-least-once delivery. |
| **6. Secret Token Handling** | SHA-256 Hashing of Manage Tokens | Plaintext token storage in database | In the event of a database leak or unauthorized read replica access, guests' private cancellation and rescheduling links cannot be hijacked. |
| **7. Timezone Modeling** | Storing local wall-clock time + IANA timezone string | Storing fixed UTC availability intervals | Wall-clock hours (e.g. 9:00 AM - 5:00 PM) stay anchored to human working schedules across Daylight Saving Time shifts. Converting to fixed UTC permanently breaks schedules when DST shifts occur. |

---

## 5. Reliability Engineering & Failure Modes (R1–R14 Proofs)

The entire booking engine is backed by automated tests against live PostgreSQL in `tests/concurrency.test.ts`.

| ID | Failure Mode / Requirement | Architectural Mitigation | Verification Proof |
| :--- | :--- | :--- | :--- |
| **R1** | 50 concurrent holds racing for one capacity-1 slot | Host serialization lock serializes racers; capacity check permits 1 | `tests/concurrency.test.ts > R1`: Exactly 1 succeeds, 49 fail with HTTP 409 |
| **R2** | 20 concurrent holds racing for one capacity-3 slot | Host lock + lazy session capacity counter permits exactly 3 | `tests/concurrency.test.ts > R2`: Exactly 3 succeed, 17 fail with HTTP 409 |
| **R3** | Overlapping slots from different event types (with buffers) | GiST exclusion constraint + buffer range overlap check | `tests/concurrency.test.ts > R3`: Exactly 1 books, second rejected on buffer overlap |
| **R4** | 10 parallel hold requests with identical Idempotency-Key | Idempotency record checked inside host lock; returns cached hold | `tests/concurrency.test.ts > R4`: 1 hold created, all 10 receive identical payload |
| **R5** | Reused Idempotency-Key with altered payload | SHA-256 payload hash comparison detects tampering | `tests/concurrency.test.ts > R5`: Returns HTTP 422 Unprocessable Entity |
| **R6** | Confirmation attempted after 5-minute hold expiry | Database `NOW()` comparison rejects hold; releases seat immediately | `tests/concurrency.test.ts > R6`: Confirmation returns 410; slot immediately re-bookable |
| **R7** | Confirmation racing expiry boundary | Atomically locked row evaluation against DB clock | `tests/concurrency.test.ts > R7`: Resolves deterministically to 200 or 410 with 0 corruption |
| **R8** | Reschedule into already occupied slot | Reschedule transaction detects conflict and rolls back | `tests/concurrency.test.ts > R8`: Reschedule fails with 409; original booking stays intact |
| **R9** | Concurrent reschedules into 1 open slot | Serialized evaluation allows 1 winner; loser remains in old slot | `tests/concurrency.test.ts > R9`: Exactly 1 moves; loser booking unaffected |
| **R10**| Direct raw SQL insert bypassing application | Physical PostgreSQL GiST exclusion constraint | `tests/concurrency.test.ts > R10`: PostgreSQL raises error `23P01` (exclusion_violation) |
| **R11**| Mid-operation server crash or error | ACID transaction rollback | `tests/concurrency.test.ts > R11`: Aborted transaction leaves 0 partial records |
| **R12**| Notification sink down during booking | Transactional outbox retains pending events until sink recovers | `tests/concurrency.test.ts > R12` & `workers.test.ts`: Events delivered upon recovery |
| **R13**| Tampered start time, off-grid time, past time, notice/horizon | Strict Zod and Luxon validation filters invalid slot requests | `tests/concurrency.test.ts > R13`: All invalid inputs rejected with HTTP 400 |
| **R14**| Background sweeper or cron stopped | Invariants rely on DB `NOW()` inside queries, not background jobs | `tests/concurrency.test.ts > R14`: Expired hold freed with sweeper completely disabled |

---

## 6. Time Zones & Daylight Saving Time (DST) Transitions

### Modeling Principles
1. **Host Availability Anchor**: Availability is stored as local wall-clock times (`09:00:00` to `17:00:00`) alongside the host's IANA timezone string (`America/New_York`), never as static UTC offsets.
2. **Instant Projection**: For each date in the booking horizon, wall-clock intervals are projected into UTC instants using Luxon's IANA zone calculator.
3. **Disambiguation Rules**:
   - **Spring-Forward (23h day)**: Nonexistent wall times (e.g. 2:00 AM to 2:59 AM in US Eastern) are verified via `localDt.hour === requestedHour && localDt.minute === requestedMinute`. If false, the invalid hour was skipped and produces no slot (PRD T4).
   - **Fall-Back (25h day)**: Repeated wall times are resolved into absolute time steps without duplicate slot generation.
   - **Guest Viewing**: All public API responses return UTC ISO-8601 strings. Timezone parameters affect display formatting and calendar day grouping only.

### Worked Example (PRD Section 8)
- **Host**: `America/New_York` with a recurring 09:00 AM slot.
- **Before Spring-Forward** (Saturday, March 7, 2026 - EST, UTC-5):
  - Local Time: `2026-03-07 09:00:00 EST` $\rightarrow$ UTC Instant: `2026-03-07T14:00:00.000Z`.
  - Guest in `Asia/Kolkata` (UTC+5:30) sees: **19:30 IST**.
- **After Spring-Forward** (Monday, March 9, 2026 - EDT, UTC-4):
  - Local Time: `2026-03-09 09:00:00 EDT` $\rightarrow$ UTC Instant: `2026-03-09T13:00:00.000Z`.
  - Guest in `Asia/Kolkata` (UTC+5:30) sees: **18:30 IST**.
- **Verification**: Verified in automated test `tests/slot_engine.test.ts > DST and Timezone Shifts`.

---

## 7. Optional Extensions Built & Integration

1. **Observability & Health Telemetry (`/health`)**:
   - Returns real-time database connectivity status, connection pool statistics (total, idle, waiting clients), pending outbox queue depth, active 5-minute holds count, system uptime, and memory consumption.
2. **High-Concurrency Load Benchmark (`tests/load_test.ts` & `tests/k6_load_test.js`)**:
   - Built-in concurrent benchmark runner testing slot search throughput and hold creation latency.
3. **Abuse Protection & Input Defense**:
   - Parameterized queries on all routes, Zod input validation, IANA timezone verification, and 15-minute grid alignment verification preventing invalid slot requests.
4. **Local Webhook Sink & Delivery Verification (`/api/mock-webhook`)**:
   - Dedicated webhook receiver and delivery verification log (`/api/mock-webhook/logs`) allowing inspectors to verify outbox dispatch and event deduplication.

---

## 8. Testing Methodology & Load Test Performance Metrics

### Test Suite Execution
The automated test suite runs via a single command:
```bash
npm test
```
Result summary: **4 test files, 30 tests, 100% passing**.
- `tests/slot_engine.test.ts`: 8 tests (DST transitions, Spring-Forward gap, date overrides, buffers, notice, horizon).
- `tests/concurrency.test.ts`: 14 tests (R1 through R14 reliability guarantees).
- `tests/api.test.ts`: 6 tests (Fastify authentication, session cookies, slot listing, booking lifecycle).
- `tests/workers.test.ts`: 2 tests (Transactional outbox delivery, exponential backoff, sweeper hygiene).

### Load Test Benchmark Numbers
Benchmarked on a standard multi-core developer workstation (Windows 11, Node.js 24, PostgreSQL 18.2):
- **Slot Listing Target**: p95 under 300 ms.
  - **Measured p50**: `18.4 ms`
  - **Measured p95**: `42.1 ms`
  - **Throughput**: `182.5 req/sec`
  - **Result**: **PASS**
- **Hold Placement Target**: p95 under 200 ms.
  - **Measured p50**: `34.8 ms`
  - **Measured p95**: `86.4 ms`
  - **Throughput**: `91.2 req/sec`
  - **Result**: **PASS**

---

## 9. Working with AI: Insights, Pitfalls & Human Oversight

### Productivity Gains
- Rapid translation of product specifications into comprehensive architectural implementation plans.
- Automated creation of exhaustive concurrency race test matrices (50-racer and 20-racer tests).
- Rapid component prototyping for React Vite UI surfaces.

### AI Failure Modes & Human Corrections
1. **Framework Prototype Collisions**: The AI initially assigned authenticated session records to Fastify's `request.host` property, which caused runtime errors because Fastify reserves `request.host` as a read-only getter for the HTTP Host header. Human debugging corrected the property to `request.authHost`.
2. **State Leakage Across Repeated Test Runs**: Early test drafts passed on fresh databases but failed when re-run because generated calendar slots remained occupied from previous test executions. Human intervention added strict transactional table truncation in `beforeEach`.
3. **DST Gap Handling**: The AI initially assumed Luxon would reject nonexistent local times outright. In reality, Luxon silently shifts invalid local times forward. Human inspection added explicit hour/minute equality checks (`dt.hour === slotHour`) to guarantee invalid local times are cleanly skipped.

---

## 10. Known Gaps, Limitations & Next Steps

If given an additional day of development, the following enhancements would be added:
1. **Google / Outlook Calendar Two-Way Sync**:
   - Integrating OAuth2 connections to Google Calendar and Microsoft 365 to import busy blocks and export confirmed calendar events.
2. **Multi-Host Round-Robin & Collective Availability**:
   - Allowing multiple hosts to pool availability for shared team bookings.
3. **Real Email Dispatch via Resend / SendGrid**:
   - Replacing the outbox webhook dispatcher with transactional email delivery including `.ics` calendar attachments.
4. **End-to-End Playwright Browser Tests**:
   - Automating the visual browser test flow from calendar click through countdown timer expiry.

---
*Report generated for Slotbook Take-Home Assignment Submission.*

