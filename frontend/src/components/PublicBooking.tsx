import { useState, useEffect, useRef } from 'react';
import { 
  Clock, Calendar, Users, Globe, CheckCircle, AlertCircle, ArrowLeft, 
  RefreshCw, Copy, Check, Download, CalendarPlus, ShieldCheck, UserPlus, X,
  ChevronDown, ChevronLeft, ChevronRight, ArrowRight
} from 'lucide-react';

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
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

// Helper to generate and download standard .ics calendar invite
function downloadIcsFile(event: {
  title: string;
  startIso: string;
  endIso: string;
  description: string;
  hostEmail: string;
  guestName: string;
}) {
  const formatDate = (iso: string) => new Date(iso).toISOString().replace(/-|:|\.\d\d\d/g, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotbook Enterprise Scheduler//v1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@slotbook.io`,
    `DTSTAMP:${formatDate(new Date().toISOString())}`,
    `DTSTART:${formatDate(event.startIso)}`,
    `DTEND:${formatDate(event.endIso)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    'LOCATION:Virtual Meeting / Google Meet Room',
    `ORGANIZER;CN=Dr. Alexander Wright:mailto:${event.hostEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${event.guestName}:mailto:guest@example.com`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to generate Google Calendar Template Link
function getGoogleCalendarUrl(event: {
  title: string;
  startIso: string;
  endIso: string;
  details: string;
}) {
  const format = (iso: string) => new Date(iso).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const dates = `${format(event.startIso)}/${format(event.endIso)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${dates}&details=${encodeURIComponent(event.details)}&location=${encodeURIComponent('Virtual Meeting')}`;
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

  // Booking Flow State
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const selectedSlotRef = useRef<Slot | null>(selectedSlot);
  selectedSlotRef.current = selectedSlot;
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
  const todayDateStr = getTodayDateStr(guestTz);
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStr(guestTz));
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Keep calendar month aligned with selectedDate
  useEffect(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setCalendarMonth(new Date(y, m - 1, 1));
      }
    }
  }, [selectedDate]);

  // Click outside listener for calendar popover
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

  // Optional Extension: Waitlist State
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSlotTime, setWaitlistSlotTime] = useState<string>('');
  const [submittingWaitlist, setSubmittingWaitlist] = useState(false);
  const [waitlistSuccessMessage, setWaitlistSuccessMessage] = useState<string | null>(null);

  // Load available slots (supports silent background reload without UI flicker)
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

  const broadcastSlotChange = () => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('slotbook_realtime_sync');
        bc.postMessage({ type: 'SLOTS_CHANGED' });
        bc.close();
      }
    } catch {}
  };

  useEffect(() => {
    fetchSlots();
  }, [hostSlug, eventSlug, guestTz]);

  // Real-Time Cross-Tab & Cross-Device Auto-Sync (BroadcastChannel + SSE + Smart Polling)
  useEffect(() => {
    // 1. Same-Browser Multi-Tab Real-Time Sync via BroadcastChannel (0ms latency)
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('slotbook_realtime_sync');
        channel.onmessage = (msg) => {
          if (msg.data?.type === 'SLOTS_CHANGED') {
            fetchSlots(true);
          }
        };
      } catch {}
    }

    // 2. Real-Time Server-Sent Events (SSE) Stream (< 50ms latency across any device)
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
    } catch (err) {
      console.warn('SSE stream not available, falling back to interval polling');
    }

    // 3. Fallback Auto-Refresh Interval (polls silently every 2.5 seconds while browsing slots)
    const pollInterval = setInterval(() => {
      if (!selectedSlotRef.current && document.visibilityState === 'visible') {
        fetchSlots(true);
      }
    }, 2500);

    // 4. Instant Refresh on Tab Focus / Window Visibility Change
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

  // Acquire Hold on Slot Selection (PRD G-3)
  const handleSelectSlot = async (slot: Slot) => {
    setError(null);
    setLoading(true);
    try {
      const idempotencyKey = `hold-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const res = await fetch('/api/holds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          hostSlug,
          eventSlug,
          slotStart: slot.start_at,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Slot is no longer available');
      }

      const holdData = await res.json();
      setSelectedSlot(slot);
      setHoldId(holdData.hold_id);
      setHoldExpiresAt(holdData.hold_expires_at);
      setHoldExpired(false);
      broadcastSlotChange();
    } catch (e: any) {
      setError(e.message);
      await fetchSlots(); // Refresh slots on conflict
    } finally {
      setLoading(false);
    }
  };

  // Confirm Hold (PRD G-4)
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holdId || holdExpired) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/holds/${holdId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName,
          guestEmail,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Confirmation failed');
      }

      const confirmedData = await res.json();
      setConfirmedBooking(confirmedData);
      broadcastSlotChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (holdId && !holdExpired) {
      try {
        // Explicitly release the hold so the slot is immediately available
        await fetch(`/api/holds/${holdId}/release`, { method: 'POST' });
        broadcastSlotChange();
      } catch (err) {
        console.error('Failed to release hold:', err);
      }
    }
    setSelectedSlot(null);
    setHoldId(null);
    setHoldExpiresAt(null);
    setSecondsRemaining(null);
    setHoldExpired(false);
    setConfirmedBooking(null);
    setError(null);
    await fetchSlots();
    broadcastSlotChange();
  };

  // Release hold on tab close or navigation away
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (holdId && !holdExpired) {
        navigator.sendBeacon(`/api/holds/${holdId}/release`);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [holdId, holdExpired]);

  const copyManageLink = () => {
    if (!confirmedBooking) return;
    const url = `${window.location.origin}/manage/${confirmedBooking.token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  // Selected Day Slots (strictly for the active day)
  const selectedDaySlots = slotsByDate[selectedDate] || [];

  // Next available date with open slots (for one-click jump)
  const nextAvailableDate = sortedDates.find((d) => d > selectedDate && (slotsByDate[d]?.length || 0) > 0);

  const dropdownDateLabel = formatIsoDate(selectedDate, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarMonthLabel = calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();

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

  const handlePrevMonth = () => {
    setCalendarMonth(new Date(calendarYear, calendarMonthIndex - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(calendarYear, calendarMonthIndex + 1, 1));
  };

  // SUCCESS CONFIRMATION VIEW
  if (confirmedBooking) {
    const manageUrl = `${window.location.origin}/manage/${confirmedBooking.token}`;
    const formattedStartTime = new Date(confirmedBooking.start_at).toLocaleString([], {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: guestTz,
    });

    const googleCalUrl = getGoogleCalendarUrl({
      title: confirmedBooking.event_name,
      startIso: confirmedBooking.start_at,
      endIso: confirmedBooking.end_at,
      details: `Scheduled with Dr. Alexander Wright via Slotbook Enterprise Scheduler.\nManage your reservation at: ${manageUrl}`,
    });

    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-lg text-center animate-in fade-in duration-300">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-emerald-100">
          <CheckCircle className="w-9 h-9" />
        </div>

        <span className="px-3 py-1 bg-emerald-100/80 text-emerald-800 text-xs font-bold rounded-full uppercase tracking-wider">
          Booking Confirmed
        </span>

        <h2 className="text-3xl font-extrabold text-slate-900 mt-3">You're Scheduled!</h2>
        <p className="text-slate-600 text-sm mt-1.5">
          A confirmation record and outbox webhook have been dispatched.
        </p>

        {/* Meeting Details Card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 my-6 text-left space-y-3 text-sm">
          <div className="flex justify-between items-center border-b border-slate-200/60 pb-2.5">
            <span className="text-slate-500 font-medium">Session:</span>
            <span className="font-bold text-slate-900">{confirmedBooking.event_name}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-200/60 pb-2.5">
            <span className="text-slate-500 font-medium">Host:</span>
            <span className="font-semibold text-slate-800">@{hostSlug}</span>
          </div>
          <div className="flex justify-between items-center border-b border-slate-200/60 pb-2.5">
            <span className="text-slate-500 font-medium">Guest:</span>
            <span className="font-semibold text-slate-800">{confirmedBooking.guest_name} ({confirmedBooking.guest_email})</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-slate-500 font-medium">Time ({guestTz}):</span>
            <span className="font-bold text-indigo-700 text-right">{formattedStartTime}</span>
          </div>
        </div>

        {/* Calendar Export Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => downloadIcsFile({
              title: confirmedBooking.event_name,
              startIso: confirmedBooking.start_at,
              endIso: confirmedBooking.end_at,
              description: `Confirmed meeting with @${hostSlug}.\nManage Link: ${manageUrl}`,
              hostEmail: 'invitations@slotbook.io',
              guestName: confirmedBooking.guest_name,
            })}
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs hover:bg-slate-50 transition"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Download .ics Calendar</span>
          </button>

          <a
            href={googleCalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100/70 text-indigo-700 rounded-xl text-xs font-semibold transition"
          >
            <CalendarPlus className="w-4 h-4 text-indigo-600" />
            <span>Add to Google Calendar</span>
          </a>
        </div>

        {/* Private Manage Link Box (PRD G-6) */}
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 text-left mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" /> Private Manage Link
            </span>
            <button
              onClick={copyManageLink}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-2xs transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
          <p className="text-xs font-mono text-indigo-950 break-all select-all bg-white p-2.5 rounded-lg border border-indigo-100">
            {manageUrl}
          </p>
          <p className="text-[11px] text-indigo-600 mt-2">
            Save this link to view, reschedule, or cancel your booking at any time.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`/manage/${confirmedBooking.token}`}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            Open Manage Booking Portal
          </a>
          <button
            onClick={handleReset}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
          >
            Schedule Another Call
          </button>
        </div>
      </div>
    );
  }

  // MAIN BOOKING INTERFACE
  return (
    <div className={`max-w-4xl mx-auto bg-white overflow-hidden ${isEmbedded ? 'rounded-none border-0 shadow-none' : 'border border-slate-200/90 rounded-3xl shadow-sm'}`}>
      {/* Top Banner / Event Header */}
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

        {/* Timezone Switcher */}
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
            Host operating timezone: <span className="text-slate-200 font-mono font-semibold">{data?.host.timezone || 'America/New_York'}</span>
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-sm text-red-800 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Booking Conflict</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {selectedSlot ? (
          /* STEP 2: HOLD ACQUIRED & GUEST CONFIRMATION FORM */
          <div className="max-w-xl mx-auto">
            <button
              onClick={handleReset}
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to time slots</span>
            </button>

            {/* Visual Hold Countdown Progress Banner */}
            <div
              className={`p-5 rounded-2xl border mb-6 transition-all duration-300 ${
                holdExpired
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : (secondsRemaining !== null && secondsRemaining < 60)
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <Clock className={`w-4 h-4 ${holdExpired ? 'text-red-600' : 'text-indigo-600'}`} />
                  <span>{holdExpired ? 'Hold Expired' : 'Slot Temporarily Locked for You'}</span>
                </div>
                {secondsRemaining !== null && !holdExpired && (
                  <span className="font-mono font-bold text-xs px-2.5 py-1 bg-white/90 rounded-md border border-indigo-200 shadow-2xs">
                    {Math.floor(secondsRemaining / 60)}:
                    {(secondsRemaining % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              {secondsRemaining !== null && !holdExpired && (
                <div className="mt-3 w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      secondsRemaining < 60 ? 'bg-amber-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, (secondsRemaining / 300) * 100)}%` }}
                  />
                </div>
              )}

              <p className="text-xs mt-2 text-slate-600">
                {holdExpired
                  ? 'Your 5-minute hold expired. The slot has been released back into the pool.'
                  : 'This slot is reserved against all concurrent racers while you complete the form.'}
              </p>

              {holdExpired && (
                <button
                  onClick={handleReset}
                  className="mt-3 px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition"
                >
                  Pick a Fresh Slot
                </button>
              )}
            </div>

            {/* Selected Slot Summary */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-sm">
              <div className="font-bold text-slate-900 mb-1">
                {new Date(selectedSlot.start_at).toLocaleDateString([], {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: guestTz,
                })}
              </div>
              <div className="text-slate-600 flex items-center gap-2 text-xs">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="font-medium">
                  {selectedSlot.display_start} – {selectedSlot.display_end} ({guestTz})
                </span>
              </div>
            </div>

            {/* Guest Form */}
            <form onSubmit={handleConfirm} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  disabled={holdExpired || submitting}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Corporate Email Address
                </label>
                <input
                  type="email"
                  required
                  disabled={holdExpired || submitting}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="jane.doe@acme.corp"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={holdExpired || submitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-md shadow-indigo-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Confirm & Lock In Reservation</span>
              </button>
            </form>
          </div>
        ) : (
          /* STEP 1: TIME SLOT SELECTOR */
          <div className="space-y-6">
            {/* Top Toolbar: Date Selector Dropdown + Day Steppers + Status */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              {/* Date Dropdown & Stepper Controls */}
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

                {/* Day Stepper Controls */}
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

                {/* Calendar Dropdown Popover */}
                {showCalendarDropdown && (
                  <div className="absolute left-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-76 sm:w-80 animate-in fade-in zoom-in-95">
                    {/* Month Header & Controls */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs sm:text-sm font-bold text-slate-900">{calendarMonthLabel}</span>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Weekday Labels */}
                    <div className="grid grid-cols-7 gap-1 text-center mb-1">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                        <div key={d} className="text-[10px] font-bold text-slate-400 py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* Days Matrix */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                        <div key={`blank-${idx}`} className="h-8 w-8" />
                      ))}
                      {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const dStr = `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const hasSlots = (slotsByDate[dStr]?.length || 0) > 0;
                        const isSelected = selectedDate === dStr;
                        const isToday = dStr === todayDateStr;
                        const isPast = dStr < todayDateStr;

                        return (
                          <button
                            key={dStr}
                            type="button"
                            disabled={isPast}
                            onClick={() => {
                              setSelectedDate(dStr);
                              setShowCalendarDropdown(false);
                            }}
                            className={`h-8 w-8 mx-auto rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all relative ${
                              isSelected
                                ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                : hasSlots
                                ? 'bg-indigo-50/80 text-indigo-950 font-bold hover:bg-indigo-100 border border-indigo-200/70'
                                : isToday
                                ? 'border border-slate-300 text-slate-900 font-bold hover:bg-slate-50'
                                : isPast
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span>{dayNum}</span>
                            {hasSlots && !isSelected && (
                              <span className="w-1 h-1 rounded-full bg-emerald-500 absolute bottom-1"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Footer Legend */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>Available Slots</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDate(todayDateStr);
                          setCalendarMonth(new Date());
                          setShowCalendarDropdown(false);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        Jump to Today
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status and Refresh */}
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

            {/* Selected Date Card & Slots */}
            <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/40">
              {/* Day Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200/80">
                <div>
                  <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5">
                    Viewing Appointments For
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                    {formatIsoDate(selectedDate, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </h3>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    selectedDaySlots.length > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {selectedDaySlots.length} available slot{selectedDaySlots.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Slot Grid or Empty State */}
              {selectedDaySlots.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {selectedDaySlots.map((slot) => {
                    const isGroup = slot.capacity > 1;
                    return (
                      <button
                        key={slot.start_at}
                        onClick={() => handleSelectSlot(slot)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectSlot(slot);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Reserve slot at ${slot.display_start}`}
                        className="p-3.5 border border-slate-200/90 rounded-xl bg-white hover:border-indigo-600 hover:bg-indigo-50/50 hover:shadow-2xs text-center transition group relative focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <div className="text-base font-bold text-slate-900 group-hover:text-indigo-600 tracking-tight transition">
                          {slot.display_start}
                        </div>
                        {isGroup ? (
                          <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center justify-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            <span>{slot.seats_left} seat{slot.seats_left === 1 ? '' : 's'} left</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 group-hover:text-indigo-500 mt-0.5 transition">
                            {data?.event.duration_min} min • 1-on-1
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* No Slots on Selected Day */
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-base">
                    No Appointments Available
                  </h4>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                    There are no open slots on this date. Choose another date from the calendar above, or jump directly to the next open opening.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    {nextAvailableDate && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate(nextAvailableDate)}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
                      >
                        <span>
                          Jump to Next Open Day ({formatIsoDate(nextAvailableDate, { month: 'short', day: 'numeric' })})
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setWaitlistSlotTime(selectedDate + 'T09:00:00Z');
                        setShowWaitlistModal(true);
                      }}
                      className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Join Waitlist for This Day</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Priority Waitlist Footer Banner */}
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

      {/* Waitlist Modal */}
      {showWaitlistModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Join Priority Waitlist</h3>
              </div>
              <button
                onClick={() => setShowWaitlistModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              If an attendee cancels or reschedules, you will be automatically placed in line and offered a 10 minute priority hold.
            </p>

            {waitlistSuccessMessage ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
                {waitlistSuccessMessage}
              </div>
            ) : (
              <form onSubmit={handleJoinWaitlist} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    value={waitlistName}
                    onChange={(e) => setWaitlistName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingWaitlist}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-sm transition disabled:opacity-50"
                >
                  {submittingWaitlist ? 'Registering...' : 'Register for Waitlist'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
