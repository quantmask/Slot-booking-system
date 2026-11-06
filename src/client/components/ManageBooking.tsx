import React, { useState, useEffect } from 'react';
import { Calendar, Clock, AlertCircle, CheckCircle, RefreshCw, XCircle, ArrowRight, ArrowLeft } from 'lucide-react';

interface ManageBookingProps {
  token: string;
}

export default function ManageBooking({ token }: ManageBookingProps) {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reschedule state
  const [rescheduling, setRescheduling] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedNewSlot, setSelectedNewSlot] = useState<any | null>(null);
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  // Cancellation state
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      const guestTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
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
        throw new Error(err.message || 'Cancellation failed');
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
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
        <p>Loading booking details...</p>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="max-w-md mx-auto p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
        <h3 className="font-semibold text-lg mb-1">Booking Not Found</h3>
        <p className="text-sm mb-4">{error}</p>
        <a
          href="/"
          className="inline-block px-4 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition"
        >
          Return Home
        </a>
      </div>
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const startDate = new Date(booking.start_at);
  const endDate = new Date(booking.end_at);

  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400">
            Booking Management
          </span>
          <h1 className="text-2xl font-bold mt-0.5">{booking.event_name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            with @{booking.host_slug} ({booking.duration_min} mins)
          </p>
        </div>

        <div>
          {isCancelled ? (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/40 rounded-full text-xs font-semibold">
              <XCircle className="w-3.5 h-3.5" /> Cancelled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5" /> Confirmed
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rescheduleSuccess && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Booking successfully rescheduled!</span>
          </div>
        )}

        {/* Reschedule View */}
        {rescheduling ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900">Select a New Slot</h2>
              <button
                onClick={() => setRescheduling(false)}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Cancel Reschedule
              </button>
            </div>

            {loadingSlots ? (
              <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading available slots...</span>
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                No alternative slots available right now.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedNewSlot?.start_at === slot.start_at;
                    return (
                      <button
                        key={slot.start_at}
                        onClick={() => setSelectedNewSlot(slot)}
                        className={`p-2.5 rounded-lg border text-left text-xs transition ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50 font-semibold text-indigo-900'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="text-[11px] text-slate-500">{slot.guest_date}</div>
                        <div>
                          {slot.display_start} – {slot.display_end}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleRescheduleSubmit}
                  disabled={!selectedNewSlot || submitting}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Move to New Slot
                </button>
              </div>
            )}
          </div>
        ) : cancelling ? (
          /* Cancel View */
          <form onSubmit={handleCancelSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-red-700">Cancel This Booking</h2>
              <button
                type="button"
                onClick={() => setCancelling(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Back
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Cancellation (Required)
              </label>
              <textarea
                required
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please state why you are cancelling..."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !cancelReason.trim()}
              className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Confirm Cancellation
            </button>
          </form>
        ) : (
          /* Standard Booking Details View */
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 text-xs">Guest</span>
                <span className="font-semibold text-slate-900">
                  {booking.guest_name} ({booking.guest_email})
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 text-xs">Date & Time</span>
                <span className="font-semibold text-slate-900 text-right">
                  {startDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })},{' '}
                  {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500 text-xs">Host Timezone</span>
                <span className="font-mono text-xs text-slate-700">{booking.host_timezone}</span>
              </div>

              {isCancelled && booking.cancel_reason && (
                <div className="py-2 bg-red-50/50 p-2.5 rounded border border-red-200 text-xs text-red-800">
                  <span className="font-semibold">Cancellation Reason:</span> {booking.cancel_reason}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {!isCancelled && (
              <div className="flex gap-3">
                <button
                  onClick={startReschedule}
                  className="flex-1 py-2.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                  Reschedule Slot
                </button>
                <button
                  onClick={() => setCancelling(true)}
                  className="py-2.5 px-4 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
