import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Users, Globe, CheckCircle, AlertCircle, ArrowLeft, RefreshCw, Copy, Check } from 'lucide-react';

interface PublicBookingProps {
  hostSlug: string;
  eventSlug: string;
}

interface Slot {
  start_at: string;
  end_at: string;
  display_start: string;
  display_end: string;
  guest_date: string;
  capacity: number;
  seats_left: number;
}

interface EventData {
  host: { slug: string; timezone: string };
  event: { name: string; slug: string; duration_min: number; capacity: number };
  slots: Slot[];
}

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

export default function PublicBooking({ hostSlug, eventSlug }: PublicBookingProps) {
  const [guestTz, setGuestTz] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EventData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Booking Flow State
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  // Form State
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Load available slots
  const fetchSlots = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/events/${eventSlug}/slots?tz=${encodeURIComponent(guestTz)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to load slots');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [hostSlug, eventSlug, guestTz]);

  // Hold Countdown Timer (PRD G-3, G-5)
  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const diffSec = Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000);
      if (diffSec <= 0) {
        setSecondsRemaining(0);
        setHoldExpired(true);
        clearInterval(interval);
      } else {
        setSecondsRemaining(diffSec);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  // Create 5-minute hold when picking a slot
  const handleSelectSlot = async (slot: Slot) => {
    setError(null);
    setSelectedSlot(slot);
    setHoldExpired(false);
    setSubmitting(true);

    try {
      const idempotencyKey = `hold-${hostSlug}-${eventSlug}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          hostSlug,
          eventSlug,
          slotStart: slot.start_at,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Slot could not be held');
      }

      const holdData = await res.json();
      setHoldId(holdData.hold_id);
      setHoldExpiresAt(holdData.hold_expires_at);
      setSecondsRemaining(300); // 5 minutes
    } catch (e: any) {
      setError(e.message);
      setSelectedSlot(null);
      setHoldId(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm booking
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdId || holdExpired) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/holds/${holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, guestEmail }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Confirmation failed');
      }

      const confirmed = await res.json();
      setConfirmedBooking(confirmed);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedSlot(null);
    setHoldId(null);
    setHoldExpiresAt(null);
    setHoldExpired(false);
    setConfirmedBooking(null);
    fetchSlots();
  };

  const copyManageLink = () => {
    if (!confirmedBooking) return;
    const url = `${window.location.origin}/manage/${confirmedBooking.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
        <p>Loading available slots...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-md mx-auto p-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <div className="flex items-center gap-2 mb-2 font-semibold">
          <AlertCircle className="w-5 h-5" /> Error Loading Event
        </div>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchSlots}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Confirmation Success View (PRD G-4: private manage link shown once)
  if (confirmedBooking) {
    const manageUrl = `${window.location.origin}/manage/${confirmedBooking.token}`;
    return (
      <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Booking Confirmed!</h2>
        <p className="text-slate-600 text-sm mb-6">
          You are scheduled with <span className="font-semibold">{data?.host.slug}</span> for{' '}
          <span className="font-semibold">{confirmedBooking.event_name}</span>.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left mb-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Guest:</span>
            <span className="font-medium text-slate-900">{confirmedBooking.guest_name} ({confirmedBooking.guest_email})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Start Time:</span>
            <span className="font-medium text-slate-900">
              {new Date(confirmedBooking.start_at).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
            </span>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-left mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Private Manage Link (Shown Once)
            </span>
            <button
              onClick={copyManageLink}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
          <p className="text-xs font-mono text-indigo-900 break-all select-all bg-white p-2 rounded border border-indigo-100">
            {manageUrl}
          </p>
          <p className="text-xs text-indigo-600 mt-2">
            Bookmark this link or save it to view, reschedule, or cancel your booking later.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <a
            href={`/manage/${confirmedBooking.token}`}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            Go to Manage Booking
          </a>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
          >
            Book Another Slot
          </button>
        </div>
      </div>
    );
  }

  // Group slots by guest local date
  const slotsByDate: { [date: string]: Slot[] } = {};
  if (data?.slots) {
    for (const slot of data.slots) {
      if (!slotsByDate[slot.guest_date]) {
        slotsByDate[slot.guest_date] = [];
      }
      slotsByDate[slot.guest_date].push(slot);
    }
  }

  const sortedDates = Object.keys(slotsByDate).sort();

  return (
    <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Top Banner / Event Header */}
      <div className="p-6 sm:p-8 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1">
              @{data?.host.slug}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">{data?.event.name}</h1>
          </div>
          <div className="flex flex-wrap gap-4 text-xs sm:text-sm text-slate-300">
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>{data?.event.duration_min} minutes</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>{data?.event.capacity === 1 ? 'One-on-One' : `Group (Max ${data?.event.capacity} seats)`}</span>
            </div>
          </div>
        </div>

        {/* Timezone Switcher (PRD G-2, T5) */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>Timezone:</span>
            <select
              value={guestTz}
              onChange={(e) => setGuestTz(e.target.value)}
              className="bg-slate-800 text-white rounded border border-slate-700 px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <span className="text-slate-400">
            Host timezone: <span className="text-slate-200 font-mono">{data?.host.timezone}</span>
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {selectedSlot ? (
          /* Step 2: Hold & Confirmation Form */
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setSelectedSlot(null)}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" /> Pick a different time
            </button>

            {/* Hold Banner with Countdown (PRD G-3, G-5) */}
            <div className={`p-4 rounded-xl border mb-6 ${
              holdExpired
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {holdExpired ? 'Hold Expired' : 'Slot Temporarily Held'}
                </span>
                {!holdExpired && secondsRemaining !== null && (
                  <span className="text-sm font-mono font-bold text-amber-800">
                    {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>
              <p className="text-xs mt-1">
                {holdExpired
                  ? 'Your 5-minute hold has expired. Please release and choose fresh slots.'
                  : 'This slot is reserved for you while you enter your details.'}
              </p>
              {holdExpired && (
                <button
                  onClick={handleReset}
                  className="mt-3 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition"
                >
                  Find Fresh Slots
                </button>
              )}
            </div>

            {/* Selected Slot Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-sm">
              <div className="font-semibold text-slate-800 mb-1">
                {new Date(selectedSlot.start_at).toLocaleDateString([], {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: guestTz,
                })}
              </div>
              <div className="text-slate-600 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span>
                  {selectedSlot.display_start} – {selectedSlot.display_end} ({guestTz})
                </span>
              </div>
            </div>

            {/* Guest Form */}
            <form onSubmit={handleConfirm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  disabled={holdExpired || submitting}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Alex Smith"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  disabled={holdExpired || submitting}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={holdExpired || submitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                Confirm Booking
              </button>
            </form>
          </div>
        ) : (
          /* Step 1: Slot Picker grouped by Date */
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Available Times
              </h2>
              <button
                onClick={fetchSlots}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {sortedDates.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                No slots available within the booking horizon. Please check back later.
              </div>
            ) : (
              <div className="space-y-6">
                {sortedDates.map((dateStr) => {
                  const daySlots = slotsByDate[dateStr];
                  const dateObj = new Date(daySlots[0].start_at);
                  const formattedDate = dateObj.toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    timeZone: guestTz,
                  });

                  return (
                    <div key={dateStr} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        {formattedDate}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {daySlots.map((slot) => {
                          const isGroup = slot.capacity > 1;
                          return (
                            <button
                              key={slot.start_at}
                              onClick={() => handleSelectSlot(slot)}
                              className="p-2.5 border border-slate-200 rounded-lg bg-white hover:border-indigo-500 hover:bg-indigo-50/50 text-center transition group shadow-2xs"
                            >
                              <div className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600">
                                {slot.display_start}
                              </div>
                              {isGroup && (
                                <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                                  {slot.seats_left} seat{slot.seats_left === 1 ? '' : 's'} left
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

