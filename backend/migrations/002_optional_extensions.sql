-- Migration 002: Optional Extensions Schema
-- Adds support for:
-- 1. Daily caps and per-guest limit
-- 2. External busy times import (manual & .ics)
-- 3. Host custom webhooks with HMAC signing & delivery log
-- 4. Session waitlists with automatic priority promotion
-- 5. Automated 24h & 1h appointment reminders
-- 6. Team round-robin assignments

-- 1. Daily booking cap on hosts & event types
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS daily_booking_cap INTEGER DEFAULT NULL;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS daily_booking_cap INTEGER DEFAULT NULL;
ALTER TABLE event_types ADD COLUMN IF NOT EXISTS is_round_robin BOOLEAN DEFAULT FALSE;

-- 2. External Busy Times (Imported calendars or manual blocks)
CREATE TABLE IF NOT EXISTS external_busy_times (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Busy',
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_busy_time_order CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_busy_times_host ON external_busy_times (host_id, start_at, end_at);

-- 3. Host Webhooks with HMAC Secret & Delivery Logs
CREATE TABLE IF NOT EXISTS host_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    event_id UUID,
    event_type TEXT NOT NULL,
    url TEXT NOT NULL,
    status_code INTEGER,
    error_message TEXT,
    delivery_duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_host ON webhook_logs (host_id, created_at DESC);

-- 4. Waitlists for fully booked sessions
CREATE TABLE IF NOT EXISTS waitlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'converted', 'expired', 'cancelled')),
    hold_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    offered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlists_session ON waitlists (session_id, status);

-- 5. Appointment Reminders (24h and 1h triggers)
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24h', '1h')),
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled ON reminders (status, scheduled_for) WHERE status = 'pending';

-- 6. Team round-robin mappings
CREATE TABLE IF NOT EXISTS event_team_hosts (
    event_type_id UUID NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
    host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    PRIMARY KEY (event_type_id, host_id)
);
