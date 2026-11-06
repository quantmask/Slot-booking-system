import { useState, useEffect } from 'react';
import { 
  CheckCircle, RefreshCw, XCircle, Download, CalendarPlus 
} from 'lucide-react';
import { downloadIcsFile, getGoogleCalendarUrl } from '../lib/calendar.js';

interface ManageBookingProps {
  token: string;
}

export default function ManageBooking({ token }: ManageBookingProps) {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rescheduling, setRescheduling] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedNewSlot, setSelectedNewSlot] = useState<any | null>(null);
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const guestTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const fetchBooking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Booking not found');
      }
      const data = await res.json();
      setBooking(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [token]);

  // Load slots for rescheduling
  const startReschedule = async () => {
    if (!booking) return;
    setRescheduling(true);
    setLoadingSlots(true);
    setError(null);

    try {
      const res = await fetch(`/api/hosts/${booking.host_slug}/events/${booking.event_slug}/slots?tz=${encodeURIComponent(guestTz)}`);
      if (!res.ok) throw new Error('Failed to load slots for rescheduling');
      const data = await res.json();
      setAvailableSlots(data.slots || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!selectedNewSlot) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlotStart: selectedNewSlot.start_at }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to reschedule');
      }

      setRescheduleSuccess(true);
      setRescheduling(false);
      setSelectedNewSlot(null);
      await fetchBooking();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookings/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to cancel booking');
      }

      setCancelling(false);
      await fetchBooking();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Loading reservation details...</span>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-lg">
        <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-900">Reservation Not Found</h2>
        <p className="text-xs text-slate-500 mt-2 mb-6">
          This private management token may be invalid or has expired.
        </p>
        <a
          href="/"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition inline-block"
        >
          Return to Home
        </a>
      </div>
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const formattedStart = new Date(booking.start_at).toLocaleString([], {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: guestTz,
  });

  const googleCalUrl = getGoogleCalendarUrl({
    title: booking.event_name,
    startIso: booking.start_at,
    endIso: booking.end_at,
    details: `Scheduled with Dr. Alexander Wright via Slotbook Enterprise Scheduler.\nManage Token: ${token}`,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Boarding Pass / Ticket Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm overflow-hidden">
        {/* Top colored strip */}
        <div className={`p-6 sm:p-8 text-white ${
          isCancelled
            ? 'bg-slate-700'
            : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                isCancelled
                  ? 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
              }`}>
                {isCancelled ? 'Booking Cancelled' : 'Confirmed Reservation'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight">
                {booking.event_name}
              </h1>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">Host</div>
              <div className="text-sm font-bold text-white">Dr. Alexander Wright</div>
              <div className="text-xs text-indigo-300 font-mono">@{booking.host_slug}</div>
            </div>
          </div>
        </div>

        {/* Meeting Details Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-xs">
            <div>
              <span className="text-slate-400 font-medium block mb-1 uppercase tracking-wider text-[10px]">Guest Information</span>
              <div className="font-bold text-slate-900 text-sm">{booking.guest_name}</div>
              <div className="text-slate-500 font-mono mt-0.5">{booking.guest_email}</div>
            </div>

            <div>
              <span className="text-slate-400 font-medium block mb-1 uppercase tracking-wider text-[10px]">Scheduled Time ({guestTz})</span>
              <div className="font-bold text-indigo-700 text-sm">{formattedStart}</div>
              <div className="text-slate-500 mt-0.5">{booking.duration_min} minutes session</div>
            </div>
          </div>

          {isCancelled && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
              <span className="font-bold">Cancellation Reason:</span> {booking.cancel_reason || 'No reason provided'}
            </div>
          )}

          {rescheduleSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Meeting was rescheduled successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          {!isCancelled && !rescheduling && !cancelling && (
            <div className="space-y-4">
              {/* Calendar Exports */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => downloadIcsFile({
                    title: booking.event_name,
                    startIso: booking.start_at,
                    endIso: booking.end_at,
                    description: `Meeting with Dr. Alexander Wright via Slotbook.`,
                    guestName: booking.guest_name,
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

              {/* Management Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={startReschedule}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  Reschedule Meeting
                </button>
                <button
                  onClick={() => setCancelling(true)}
                  className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition"
                >
                  Cancel Meeting
                </button>
              </div>
            </div>
          )}

          {/* RESCHEDULE MODAL */}
          {rescheduling && (
            <div className="border border-indigo-200 bg-indigo-50/40 rounded-2xl p-5 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900">Choose a New Time Slot</h3>
                <button
                  onClick={() => setRescheduling(false)}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold"
                >
                  Close
                </button>
              </div>

              {loadingSlots ? (
                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" /> Loading fresh slots...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No alternative slots available right now.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
                  {availableSlots.slice(0, 20).map((s) => (
                    <button
                      key={s.start_at}
                      onClick={() => setSelectedNewSlot(s)}
                      className={`p-2.5 rounded-xl border text-center text-xs transition font-semibold ${
                        selectedNewSlot?.start_at === s.start_at
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-400'
                      }`}
                    >
                      <div>{s.display_start}</div>
                      <div className="text-[10px] opacity-75 font-normal">{s.guest_date}</div>
                    </button>
                  ))}
                </div>
              )}

              {selectedNewSlot && (
                <div className="pt-3 border-t border-indigo-200/60 flex items-center justify-between">
                  <div className="text-xs text-indigo-900 font-medium">
                    New Slot: <span className="font-bold">{selectedNewSlot.display_start} ({selectedNewSlot.guest_date})</span>
                  </div>
                  <button
                    onClick={handleRescheduleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Rescheduling...' : 'Confirm New Slot'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CANCELLATION MODAL */}
          {cancelling && (
            <form onSubmit={handleCancelSubmit} className="border border-rose-200 bg-rose-50/40 rounded-2xl p-5 space-y-4 animate-in fade-in">
              <div>
                <h3 className="font-bold text-sm text-rose-900">Cancel Your Meeting</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Are you sure you want to cancel this booking? The slot will be immediately freed for other guests.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Cancellation
                </label>
                <textarea
                  required
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Schedule conflict, project postponed..."
                  className="w-full p-2.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting || !cancelReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
                <button
                  type="button"
                  onClick={() => setCancelling(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-white rounded-xl text-xs font-semibold transition"
                >
                  Never mind
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
