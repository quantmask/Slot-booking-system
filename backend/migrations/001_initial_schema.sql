-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Hosts
CREATE TABLE IF NOT EXISTS hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Types
CREATE TABLE IF NOT EXISTS event_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL CHECK (duration_min >= 15 AND duration_min <= 120),
    capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
    buffer_before_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0 AND buffer_before_min <= 30),
    buffer_after_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0 AND buffer_after_min <= 30),
    min_notice_hours INTEGER NOT NULL DEFAULT 4 CHECK (min_notice_hours >= 0),
    horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (horizon_days >= 1),
    archived_at TIMESTAMPTZ,
    CONSTRAINT uq_host_event_slug UNIQUE (host_id, slug)
);

-- Weekly Availability (weekday 1=Monday to 7=Sunday as per ISO standard)
CREATE TABLE IF NOT EXISTS weekly_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday >= 1 AND weekday <= 7),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    CONSTRAINT chk_weekly_time_order CHECK (start_time < end_time)
);

-- Date Overrides
CREATE TABLE IF NOT EXISTS date_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_off BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIME,
    end_time TIME,
    CONSTRAINT chk_override_validity CHECK (
        (is_off = TRUE AND start_time IS NULL AND end_time IS NULL) OR
        (is_off = FALSE AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
    )
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    blocked_range TSTZRANGE NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity >= 1),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
    CONSTRAINT chk_session_time_order CHECK (start_at < end_at),
    CONSTRAINT no_overlapping_active_sessions EXCLUDE USING gist (
        host_id WITH =,
        blocked_range WITH &&
    ) WHERE (status = 'active')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_session_slot 
ON sessions (event_type_id, start_at) 
WHERE (status = 'active');

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
    hold_expires_at TIMESTAMPTZ,
    guest_name TEXT,
    guest_email TEXT,
    token_hash TEXT UNIQUE,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_booking_status_fields CHECK (
        (status = 'held' AND hold_expires_at IS NOT NULL) OR
        (status = 'confirmed' AND guest_name IS NOT NULL AND guest_email IS NOT NULL AND token_hash IS NOT NULL) OR
        (status = 'cancelled' AND cancel_reason IS NOT NULL) OR
        (status = 'expired')
    )
);

-- Idempotency Keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    host_id UUID REFERENCES hosts(id) ON DELETE CASCADE,
    request_hash TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications (Transactional Outbox)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_host_start ON sessions (host_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_session_status ON bookings (session_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expiry ON bookings (hold_expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON notifications (status, next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_weekly_avail_host ON weekly_availability (host_id, weekday);
CREATE INDEX IF NOT EXISTS idx_date_overrides_host ON date_overrides (host_id, date);

