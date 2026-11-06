import { useState, useEffect, useRef } from 'react';
import { 
  Clock, Calendar, Users, Globe, AlertCircle, RefreshCw, UserPlus, 
  ChevronDown, ChevronLeft, ChevronRight 
} from 'lucide-react';
import BookingSuccess from './booking/BookingSuccess.js';
import HoldForm from './booking/HoldForm.js';
import CalendarDropdown from './booking/CalendarDropdown.js';
import SlotGrid from './booking/SlotGrid.js';
import WaitlistModal from './booking/WaitlistModal.js';

interface PublicBookingProps {
  hostSlug: string;
  eventSlug: string;
  isEmbedded?: boolean;
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

const POPULAR_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

function getTodayDateStr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatIsoDate(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return dt.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  } catch {
    return isoDate;
  }
}

export default function PublicBooking({ hostSlug, eventSlug, isEmbedded = false }: PublicBookingProps) {
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

  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const selectedSlotRef = useRef<Slot | null>(selectedSlot);
  selectedSlotRef.current = selectedSlot;
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  const todayDateStr = getTodayDateStr(guestTz);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStr(guestTz));
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSlotTime, setWaitlistSlotTime] = useState<string>('');
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
  const [waitlistSuccessMessage, setWaitlistSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCalendarMonth(new Date(y, m - 1, 1));
      }
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!showCalendarDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.calendar-dropdown-container')) {
        setShowCalendarDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendarDropdown]);

  const fetchSlots = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/events/${eventSlug}/slots?tz=${encodeURIComponent(guestTz)}`);
      if (!res.ok) {
        if (!silent) {
          const err = await res.json();
          throw new Error(err.message || 'Failed to load slots');
        }
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [hostSlug, eventSlug, guestTz]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`slotbook_${hostSlug}_${eventSlug}`);
      channel.onmessage = (event) => {
        if (event.data?.type === 'SLOTS_CHANGED') {
          fetchSlots(true);
        }
      };
    } catch {}

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/hosts/${hostSlug}/events/${eventSlug}/slots/stream`);
      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'SLOTS_UPDATED') {
            fetchSlots(true);
          }
        } catch {}
      };
    } catch {}

    const pollInterval = setInterval(() => {
      if (!selectedSlotRef.current && document.visibilityState === 'visible') {
        fetchSlots(true);
      }
    }, 2500);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSlots(true);
      }
    };
    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (channel) channel.close();
      if (eventSource) eventSource.close();
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hostSlug, eventSlug, guestTz]);

  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const remainingMs = new Date(holdExpiresAt).getTime() - Date.now();
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
      setSecondsRemaining(remainingSec);
      if (remainingSec === 0) {
        setHoldExpired(true);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  const handleSelectSlot = async (slot: Slot) => {
    setError(null);
    setHoldExpired(false);
    try {
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': `hold_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        },
        body: JSON.stringify({
          hostSlug,
          eventSlug,
          slotStart: slot.start_at,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Unable to reserve slot');
      }

      const holdData = await res.json();
      setSelectedSlot(slot);
      setHoldId(holdData.hold_id);
      setHoldExpiresAt(holdData.hold_expires_at);
    } catch (err: any) {
      setError(err.message);
      fetchSlots(true);
    }
  };

  const handleReset = async () => {
    if (holdId) {
      try {
        fetch(`/api/holds/${holdId}/release`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => {});
      } catch {}
    }
    setSelectedSlot(null);
    setHoldId(null);
    setHoldExpiresAt(null);
    setHoldExpired(false);
    setError(null);
    fetchSlots(true);
  };

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
        throw new Error(err.message || 'Booking confirmation failed');
      }

      const booking = await res.json();
      setConfirmedBooking(booking);
      setSelectedSlot(null);
      setHoldId(null);
      setHoldExpiresAt(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistSlotTime) return;
    setSubmittingWaitlist(true);
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/events/${eventSlug}/slots/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotStart: waitlistSlotTime,
          guestName: waitlistName,
          guestEmail: waitlistEmail,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to join waitlist');
      }
      const waitResp = await res.json();
      setWaitlistSuccessMessage(`Registered at position #${waitResp.position}. You will be notified automatically if a spot opens.`);
      setTimeout(() => {
        setShowWaitlistModal(false);
        setWaitlistSuccessMessage(null);
        setWaitlistName('');
        setWaitlistEmail('');
      }, 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingWaitlist(false);
    }
  };

  const slotsByDate: Record<string, Slot[]> = {};
  if (data?.slots) {
    for (const slot of data.slots) {
      if (!slotsByDate[slot.guest_date]) {
        slotsByDate[slot.guest_date] = [];
      }
      slotsByDate[slot.guest_date].push(slot);
    }
  }

  const sortedDates = Object.keys(slotsByDate).sort();
  const selectedDaySlots = slotsByDate[selectedDate] || [];
  const nextAvailableDate = sortedDates.find((d) => d > selectedDate && (slotsByDate[d]?.length || 0) > 0);

  const dropdownDateLabel = formatIsoDate(selectedDate, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handlePrevDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const cur = new Date(Date.UTC(y, m - 1, d));
    cur.setUTCDate(cur.getUTCDate() - 1);
    const prevStr = cur.toISOString().slice(0, 10);
    if (prevStr >= todayDateStr) {
      setSelectedDate(prevStr);
    }
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const cur = new Date(Date.UTC(y, m - 1, d));
    cur.setUTCDate(cur.getUTCDate() + 1);
    setSelectedDate(cur.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(todayDateStr);
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  if (confirmedBooking) {
    return (
      <BookingSuccess
        confirmedBooking={confirmedBooking}
        hostSlug={hostSlug}
        guestTz={guestTz}
        onBookAnother={() => setConfirmedBooking(null)}
      />
    );
  }

  return (
    <div className={`max-w-4xl mx-auto bg-white overflow-hidden ${isEmbedded ? 'rounded-none border-0 shadow-none' : 'border border-slate-200/90 rounded-3xl shadow-sm'}`}>
      <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Dr. Alexander Wright (@{data?.host.slug || hostSlug})</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {data?.event.name || 'Executive Session'}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2.5 text-xs text-slate-200">
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold">{data?.event.duration_min || 30} minutes</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold">
                {data?.event.capacity === 1 ? 'One-on-One' : `Group (${data?.event.capacity} seats)`}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span className="font-medium">Guest Timezone:</span>
            <select
              value={guestTz}
              onChange={(e) => setGuestTz(e.target.value)}
              className="bg-slate-800 text-white font-medium rounded-lg border border-slate-700 px-2.5 py-1 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {POPULAR_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <span className="text-slate-400">
            Host timezone: <span className="text-slate-200 font-mono font-semibold">{data?.host.timezone || 'America/New_York'}</span>
          </span>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-sm text-rose-800 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Booking Conflict</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {selectedSlot ? (
          <HoldForm
            selectedSlot={selectedSlot}
            secondsRemaining={secondsRemaining}
            holdExpired={holdExpired}
            guestName={guestName}
            setGuestName={setGuestName}
            guestEmail={guestEmail}
            setGuestEmail={setGuestEmail}
            submitting={submitting}
            guestTz={guestTz}
            onReset={handleReset}
            onConfirm={handleConfirm}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-2 relative calendar-dropdown-container">
                <button
                  type="button"
                  onClick={() => setShowCalendarDropdown(!showCalendarDropdown)}
                  className="inline-flex items-center gap-2.5 px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 rounded-xl text-slate-800 text-xs sm:text-sm font-semibold shadow-2xs hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{dropdownDateLabel}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showCalendarDropdown ? 'rotate-180' : ''}`} />
                </button>

                <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={handlePrevDay}
                    disabled={selectedDate <= todayDateStr}
                    title="Previous Day"
                    className="p-1.5 rounded-lg text-slate-700 hover:bg-white hover:shadow-2xs disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleToday}
                    disabled={selectedDate === todayDateStr}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-700 hover:bg-white hover:shadow-2xs disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={handleNextDay}
                    title="Next Day"
                    className="p-1.5 rounded-lg text-slate-700 hover:bg-white hover:shadow-2xs transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {showCalendarDropdown && (
                  <CalendarDropdown
                    calendarMonth={calendarMonth}
                    selectedDate={selectedDate}
                    todayDateStr={todayDateStr}
                    slotsByDate={slotsByDate}
                    onSelectDate={(dateStr) => {
                      setSelectedDate(dateStr);
                      setShowCalendarDropdown(false);
                    }}
                    onPrevMonth={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                    onNextMonth={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                    onJumpToday={() => {
                      setSelectedDate(todayDateStr);
                      setCalendarMonth(new Date());
                      setShowCalendarDropdown(false);
                    }}
                  />
                )}
              </div>

              <div className="flex items-center gap-2.5 self-end md:self-auto">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live Sync
                </span>
                <button
                  type="button"
                  onClick={() => fetchSlots()}
                  disabled={loading}
                  title="Refresh Slots"
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <SlotGrid
              selectedDate={selectedDate}
              selectedDaySlots={selectedDaySlots}
              durationMin={data?.event.duration_min || 30}
              nextAvailableDate={nextAvailableDate}
              onSelectSlot={handleSelectSlot}
              onJumpDate={setSelectedDate}
              onOpenWaitlist={(slotTime) => {
                setWaitlistSlotTime(slotTime);
                setShowWaitlistModal(true);
              }}
              formatIsoDate={formatIsoDate}
            />

            <div className="p-4 bg-slate-100/70 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                <span>Looking for a customized or fully booked time slot? Register for automatic priority promotion.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWaitlistSlotTime(selectedDate + 'T09:00:00Z');
                  setShowWaitlistModal(true);
                }}
                className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl font-semibold shadow-2xs hover:bg-slate-50 transition shrink-0 flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Join Priority Waitlist</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <WaitlistModal
        show={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        onSubmit={handleJoinWaitlist}
        waitlistName={waitlistName}
        setWaitlistName={setWaitlistName}
        waitlistEmail={waitlistEmail}
        setWaitlistEmail={setWaitlistEmail}
        submitting={submittingWaitlist}
        successMessage={waitlistSuccessMessage}
      />
    </div>
  );
}
