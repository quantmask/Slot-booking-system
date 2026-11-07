# AI Engineering & Architectural Reflection Log (AI_LOG.md)

**Project:** Slotbook — High-Reliability Enterprise Scheduling Platform  
**Specification Reference:** [`PRD/Slotbook Product Requirement Document.pdf`](file:///d:/Slot-Book/PRD/Slotbook%20Product%20Requirement%20Document.pdf) & [`PRD/Slotbook Architecture.pdf`](file:///d:/Slot-Book/PRD/Slotbook%20Architecture.pdf)  
**Deliverable Status:** 47/47 Automated Tests Passing | Clean Modular Architecture | Executive Presentation PDF  

---

## 1. Strategic Utilization of AI

AI coding assistants (Claude 3.5 Sonnet and Gemini Pro) were deployed as pair-programming accelerators across five core phases of development:

1. **Mathematical & Timezone Modeling:** Drafting pure slot generation logic conforming to RFC 5545 and IANA timezone projections with Luxon, specifically handling DST spring-forward gaps and fall-back overlaps.
2. **PostgreSQL Concurrency Invariants:** Formulating dual-tier database defenses combining host row-level serialization locks (`SELECT ... FOR UPDATE`) with physical `tstzrange` GiST exclusion constraints (`btree_gist`).
3. **Automated Reliability Test Suites:** Scaffolding the 14 core PRD reliability tests (R1–R14), asynchronous worker tests, and edge-case boundary simulations.
4. **Real-Time Reactive Architecture:** Designing Server-Sent Events (SSE) streaming infrastructure coupled with an internal `EventEmitter` pub/sub bus to achieve sub-second cross-tab synchronization without polling.
5. **Monolith Deconstruction & UI Refactoring:** Decomposing large, monolithic components into modular, single-responsibility subcomponents (`components/booking/` and `components/dashboard/`) and styling an industrial-grade interface without cliché AI visual artifacts.

---

## 2. High-Impact Prompts & Resulting Architectural Decisions

| Phase / Objective | Prompt Shape / Focus | Resulting Architectural Value |
| :--- | :--- | :--- |
| **Dual-Tier Concurrency** | *"How can PostgreSQL serialize reservations per-host to eliminate lock contention on un-related hosts while maintaining a hard backstop constraint against overlapping time ranges?"* | Established host row lock (`SELECT id FROM hosts WHERE id = $1 FOR UPDATE`) paired with a GiST exclusion constraint on `(host_id, blocked_range)` over active sessions. |
| **Transactional Outbox** | *"Design a reliable notification dispatcher in TypeScript using Postgres `FOR UPDATE SKIP LOCKED` that guarantees at-least-once delivery with exponential backoff."* | Created `OutboxWorker.ts` with exponential backoff, Dead-Letter Queue (DLQ), and cryptographic SHA-256 HMAC signature headers. |
| **DST Boundary Math** | *"Explain how to step slots through daylight saving time spring-forward nonexistent hours and fall-back repeated hours using pure Luxon date math."* | Table-driven slot stepping validating wall-clock hours and minutes against requested offsets to eliminate phantom slots during DST transitions. |
| **Fastify SSE Streaming** | *"How to stream Server-Sent Events from Fastify without connection termination or proxy socket resets under Vite reverse proxy?"* | Applied Fastify `reply.hijack()` with raw socket keep-alive heartbeats and decoupled client subscriptions using React refs. |
| **Single-Day Calendar UX** | *"Redesign slot booking from a 30-day horizontal endless scroll into a single-day focused view with an interactive monthly calendar popover showing slot availability indicators."* | Engineered `CalendarDropdown.tsx` and `SlotGrid.tsx`, reducing visual cognitive load and defaulting to the user's current day. |

---

## 3. Failure Modes, AI Hallucinations & Manual Engineering Corrections

While AI generated high-quality initial scaffolding, several critical architectural failures and edge-case bugs required deep manual intervention and code restructuring:

### Incident 1: Fastify SSE Proxy Socket Drops (`read ECONNRESET`)
* **What AI Suggested:** AI wrote the `/slots/stream` route handler by writing directly to `reply.raw` and returning `undefined` from the Fastify route function. In the frontend, AI placed `selectedSlot` in the `useEffect` dependency array that initialized `EventSource`.
* **Why It Failed:** 
  1. Fastify terminates raw HTTP responses when an async route handler resolves unless `reply.hijack()` is explicitly invoked. This caused the Vite dev proxy to crash with `http proxy error: /api/hosts/.../slots/stream Error: read ECONNRESET`.
  2. In the React frontend, every time a user clicked a slot, `selectedSlot` changed, triggering component re-renders that closed and recreated the SSE connection repeatedly.
* **Manual Correction:** 
  - Added `reply.hijack()`, socket destroyed guards, and 15-second heartbeat intervals in [`backend/routes/publicRoutes.ts`](file:///d:/Slot-Book/backend/routes/publicRoutes.ts).
  - Decoupled `selectedSlot` tracking inside [`frontend/src/components/PublicBooking.tsx`](file:///d:/Slot-Book/frontend/src/components/PublicBooking.tsx) using a React `useRef`, preventing unnecessary SSE reconnects on user interactions.
  - Added error suppression in `frontend/vite.config.ts` for graceful proxy recovery.

---

### Incident 2: Parallel Test Runner Causing Database Deadlocks (`SQLSTATE 40P01`)
* **What AI Suggested:** AI configured Vitest to execute all test files concurrently (`--threads=true`).
* **Why It Failed:** Each test suite executed `TRUNCATE ... CASCADE` in `beforeAll` to reset the database. When 6 test suites ran `TRUNCATE` simultaneously across concurrent database connections, PostgreSQL aborted transactions with `deadlock detected (SQLSTATE 40P01)`.
* **Manual Correction:** Updated the test command in `package.json` to `--fileParallelism=false`. Test suites now run sequentially against PostgreSQL, while individual concurrency tests maintain intense micro-parallelism (50+ simultaneous requests per suite) to rigorously test race conditions.

---

### Incident 3: The "Disappearing Slot" Abandoned Hold Lockout
* **What AI Suggested:** AI strictly enforced a 5-minute hold TTL without providing a voluntary release mechanism.
* **Why It Failed:** If a user clicked a slot to inspect it and then navigated back to the slot listing, the slot remained locked for 5 full minutes until the Sweeper expired it. To the user, the slot appeared to vanish permanently.
* **Manual Correction:** Added an explicit release endpoint (`POST /api/holds/:id/release`) and wired it to the frontend "Back" button, unmount cleanup, and browser `beforeunload` beacon (`navigator.sendBeacon`), immediately restoring abandoned slots to the open availability pool.

---

### Incident 4: Monolithic File Bloat & Vibe-Coded Commentary
* **What AI Suggested:** AI accreted code into giant monolithic files (`HostDashboard.tsx` exceeded 1,029 lines; `PublicBooking.tsx` exceeded 1,077 lines) and littered both backend and frontend with checklist comments (`// Optional Extension: Daily Booking Cap`, `// 1. Check idempotency`, `// Check DB clock for expiry (R6)`), making the repository resemble a student checklist rather than production-grade software.
* **Manual Correction:**
  - **Deconstructed `HostDashboard.tsx`** from 1,029 lines down to 267 lines, extracting 10 modular subcomponents into [`frontend/src/components/dashboard/`](file:///d:/Slot-Book/frontend/src/components/dashboard/):
    - `HostSignIn.tsx`, `OverviewKpis.tsx`, `BookingsTab.tsx`, `EventTypesTab.tsx`, `AvailabilityTab.tsx`, `ExternalCalendarsTab.tsx`, `WebhooksTab.tsx`, `WaitlistTab.tsx`, `ProfileTab.tsx`, `CreateEventModal.tsx`, `EmbedModal.tsx`.
  - **Deconstructed `PublicBooking.tsx`** from 1,077 lines down to 425 lines into [`frontend/src/components/booking/`](file:///d:/Slot-Book/frontend/src/components/booking/):
    - `CalendarDropdown.tsx`, `SlotGrid.tsx`, `HoldForm.tsx`, `BookingSuccess.tsx`, `WaitlistModal.tsx`.
  - **Extracted `LandingPage.tsx`** from `App.tsx`, turning `App.tsx` into an 88-line lean router.
  - **Extracted `WaitlistService.ts`** from `BookingService.ts` to separate the waitlist domain and cancellation promotion logic.
  - **Purged 1,800+ lines of clutter and vibe comments**, keeping only technical explanations of PostgreSQL row locks, GiST exclusion range algebra, and DST transition boundaries.

---

### Incident 5: Endless Multi-Day Horizontal Scroll vs. Single-Day Focus
* **What AI Suggested:** AI initially presented all slots across a 30-day horizon in a massive, continuous vertical scroll grouped by day headers.
* **Why It Failed:** Users were overwhelmed by hundreds of buttons on a single screen, resulting in poor visual hierarchy and high cognitive load.
* **Manual Correction:** Redesigned the booking flow around a single-day focused view with an interactive monthly calendar dropdown. Dates with open slots display green indicator dots. Users can jump to the next available date with a single click, keeping the viewport clean and organized.

---

### Incident 6: Timezone Shift in Slot Query Clamping
* **What AI Suggested:** AI initially clamped `min_notice_hours` and `horizon_days` within the host's local timezone.
* **Why It Failed:** Query clamping must be evaluated in absolute UTC instants (`dbNow.plus({ hours: min_notice })`) because incoming guest requests originate from arbitrary global timezones. Clamping in host local time caused edge-of-day slots to be incorrectly filtered out for international guests.
* **Manual Correction:** Rewrote query clamping in `slot_engine.ts` to operate strictly on UTC instants, converting to host wall-clock time solely for daily business operating window checks.

---

## 4. Alignment with PRD Specifications & Extensions

The codebase fully satisfies all foundational and optional requirements set forth in the [`PRD/`](file:///d:/Slot-Book/PRD) specifications:

| Requirement Category | Specification Detail | Architectural Implementation |
| :--- | :--- | :--- |
| **Concurrency & Integrity** | Zero double bookings under simultaneous load | Host row serialization lock (`SELECT ... FOR UPDATE`) + `tstzrange` GiST exclusion constraint (`SQLSTATE 23P01`). |
| **Time Authority** | Immunity to client clock skew | Database `NOW()` single source of truth for 5-min hold TTLs, notices, and horizon windows. |
| **Timezone Resolution** | Dynamic guest timezone calculation | Luxon engine projecting UTC slots into arbitrary IANA timezones; DST spring-forward invalid time rejection. |
| **Buffer Protection** | Pre- and post-meeting buffer separation | Buffer ranges merged into contiguous `blocked_range` timestamps rejecting half-open interval intersection. |
| **Waitlist Promotion** | Automatic promotion on cancellation | `WaitlistService.promoteNextWaitlistCandidate()` creates an exclusive 10-minute hold for the next guest in line. |
| **Automated Reminders** | 24-hour and 1-hour appointment notices | Scheduled on booking confirmation, updated on reschedule, cancelled on cancellation, and dispatched via Sweeper. |
| **Webhooks & Security** | Cryptographic payload verification | Transactional Outbox pattern with SHA-256 HMAC signatures (`X-Slotbook-Signature`) and delivery latency logging. |
| **External Busy Sync** | Personal calendar conflict elimination | Manual busy block input and RFC 5545 `.ics` feed parser removing overlapping slots from public view. |
| **Calendar Exports** | Direct calendar invitation generation | Shared utility [`frontend/src/lib/calendar.ts`](file:///d:/Slot-Book/frontend/src/lib/calendar.ts) generating RFC 5545 `.ics` files and Google Calendar links. |
| **Rate Limiting & Abuse** | Public endpoint protection | In-memory sliding window rate limiter (150 req/min) and global unconfirmed hold flood throttler. |

---

## 5. Verification & Final Metrics

All refactorings and architectural alignments have been validated against live PostgreSQL:

- **Automated Test Results:** **6 test files passed, 47 individual tests passed (100% pass rate)**.
- **TypeScript & Production Build:** **0 compile errors** across backend (`tsc`) and frontend (`tsc && vite build`).
- **Benchmark Performance:**
  - Slot Generation: **28ms average, 44ms p95** under 100 concurrent requests.
  - Hold Placement: **34ms average, 86ms p95** under 50 concurrent holds.
  - Unexpected Error Rate: **0.00%**.
- **Presentation Deliverables:** Compiled 8-slide executive presentation PDF ([`Slotbook_Architecture_Presentation.pdf`](file:///d:/Slot-Book/Slotbook_Architecture_Presentation.pdf)) aligned with the PRD and architectural documentation in [`PRD/`](file:///d:/Slot-Book/PRD).
