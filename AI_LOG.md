# AI Engineering & Reflection Log (AI_LOG.md)

**Project:** Slotbook — Resilient Calendly-Style High-Concurrency Scheduling Engine  
**Author:** Candidate Submission  
**Assignment Reference:** Slotbook Product Requirements Document v1.0  

---

## 1. How AI Was Utilized

This project leveraged AI coding assistants (Claude 3.5 Sonnet and Gemini Pro) across four primary phases:
1. **Mathematical & Timezone Modeling:** Drafting pure slot generation logic conforming to RFC 5545 and IANA timezone projection with Luxon.
2. **Concurrency & Database Invariants:** Designing dual-tier PostgreSQL serialization (`FOR UPDATE` host-level locks + `tstzrange` GiST exclusion constraints).
3. **Automated Test Scenarios:** Scaffolding the 14 PRD reliability tests (R1–R14) plus extreme boundary and extension edge cases.
4. **Design & Frontend System:** Crafting a clean, executive interface without cliché AI elements.

---

## 2. Key Prompts That Drove Progress

| Objective | Prompt Shape / Focus | Resulting Architectural Value |
| :--- | :--- | :--- |
| **Dual-Tier Concurrency** | *"How can PostgreSQL serialize reservations per-host to eliminate lock contention on un-related hosts while maintaining a hard backstop constraint against overlapping time ranges?"* | Established host row lock (`SELECT id FROM hosts WHERE id = $1 FOR UPDATE`) paired with a GiST exclusion constraint on `(host_id, blocked_range)` over active sessions. |
| **Transactional Outbox** | *"Design a reliable notification dispatcher in TypeScript using Postgres `FOR UPDATE SKIP LOCKED` that guarantees at-least-once delivery with exponential backoff."* | Created `OutboxWorker.ts` with exponential backoff and idempotency headers. |
| **DST Spring & Fallback** | *"Explain how to step slots through daylight saving time spring-forward nonexistent hours and fall-back repeated hours using pure Luxon date math."* | Table-driven slot stepping validating wall-clock hours and minutes against requested offsets to eliminate phantom slots. |
| **Real-time Synchronizer** | *"How can we synchronize slot states across multiple browser tabs in 0ms without server roundtrips, and across separate network devices using SSE without UI flickering?"* | Native browser `BroadcastChannel` for instant local tab sync + Server-Sent Events with silent background re-fetch. |

---

## 3. Where AI Got Things Wrong & What Was Changed by Hand

### Incident 1: Parallel Test Runner Causing Database Deadlocks (`40P01`)
* **What AI Suggested:** AI scaffolded Vitest to run all test files in parallel (`--threads=true`).
* **Why It Failed:** Each test suite called `TRUNCATE ... CASCADE` in `beforeAll` to start from a clean slate. When 5 suites ran `TRUNCATE` simultaneously across concurrent connections, PostgreSQL aborted the transactions with `deadlock detected (SQLSTATE 40P01)`.
* **Manual Correction:** Updated `package.json` to configure `--fileParallelism=false`, ensuring test files execute sequentially against PostgreSQL while retaining micro-parallelism within concurrency race tests.

### Incident 2: The "Disappearing Slot" Abandoned Hold Lockout
* **What AI Suggested:** AI strictly enforced the 5-minute hold TTL without a release mechanism.
* **Why It Failed:** If a guest clicked a slot and then clicked "Back to time slots", the slot stayed locked for 5 full minutes until the background sweeper expired it. To the guest, the slot vanished.
* **Manual Correction:** Added an explicit release route (`POST /api/holds/:id/release`) hooked into the frontend "Back" button and tab `beforeunload` beacon (`navigator.sendBeacon`), freeing the slot in PostgreSQL immediately.

### Incident 3: Timezone Shift in Slot Query Clamping
* **What AI Suggested:** AI initially computed `min_notice_hours` and `horizon_days` in the host's local timezone.
* **Why It Failed:** Time boundary clamping must be evaluated in absolute UTC instants (`dbNow.plus({ hours: min_notice })`) because guest requests originate from arbitrary global timezones.
* **Manual Correction:** Rewrote query clamping in `slot_engine.ts` to operate entirely on UTC instants, only converting to host wall-clock time for business window evaluation.

### Incident 4: AI Over-Engineered Visual Clichés
* **What AI Suggested:** AI repeatedly added sparkle icons (`<Sparkles>`), pulsing gradients, and hyphenated buzzwords like *"AI-Powered - Ultra-Fast - Automated Scheduling"*.
* **Manual Correction:** Purged all AI clichés, stars, and promotional language. Replaced with clean SaaS typography, structured date selectors, and clear status badges.

---

## 4. Summary of Optional Extensions Implemented

1. **Daily Booking Cap:** Rejects holds with `409 DAILY_CAP_REACHED` once host or event-type daily limit is hit.
2. **Per-Guest Limit:** Prevents a guest from having more than one active booking per event type.
3. **External Busy Times:** Eliminates slots overlapping with imported calendar busy blocks or uploaded `.ics` files.
4. **Waitlist with Auto-Promotion:** When an active booking is cancelled, the system automatically creates a priority 10-minute hold for the next waitlisted guest.
5. **Automated Reminders:** Enqueues 24h and 1h reminders on confirmation, updates them on reschedule, and cancels them on cancellation.
6. **Host Webhooks with HMAC:** Dispatches webhooks with `X-Slotbook-Signature: sha256=...` and logs delivery attempts.
7. **Direct RFC 5545 `.ics` Export:** Provides `GET /api/bookings/:token/ics` for calendar downloads.
8. **Comprehensive Observability:** `/health` exposes connection pool stats, hold expiries, and notification delivery lag.
9. **Abuse Protection:** Rate limiting (150 req/min) and bot hold flood guards.
10. **Embeddable Widget:** `/embed/:host/:slug` iframe view and one-click code generator.
11. **Accessibility:** Keyboard navigation, `Enter`/`Space` handlers, ARIA labels, and live regions.
12. **Load Benchmark:** k6 load testing script in `backend/tests/k6_load_test.js`.
13. **CI/CD:** GitHub Actions workflow in `.github/workflows/ci.yml`.
