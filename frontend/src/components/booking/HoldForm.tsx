import React from 'react';
import { ArrowLeft, Clock, RefreshCw } from 'lucide-react';

interface Slot {
  start_at: string;
  end_at: string;
  display_start: string;
  display_end: string;
  guest_date: string;
  capacity: number;
  seats_left: number;
}

interface HoldFormProps {
  selectedSlot: Slot;
  secondsRemaining: number | null;
  holdExpired: boolean;
  guestName: string;
  setGuestName: (name: string) => void;
  guestEmail: string;
  setGuestEmail: (email: string) => void;
  submitting: boolean;
  guestTz: string;
  onReset: () => void;
  onConfirm: (e: React.FormEvent) => void;
}

export default function HoldForm({
  selectedSlot,
  secondsRemaining,
  holdExpired,
  guestName,
  setGuestName,
  guestEmail,
  setGuestEmail,
  submitting,
  guestTz,
  onReset,
  onConfirm,
}: HoldFormProps) {
  return (
    <div className="max-w-xl mx-auto animate-in fade-in duration-200">
      <button
        onClick={onReset}
        className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to time slots</span>
      </button>

      <div
        className={`p-5 rounded-2xl border mb-6 transition-all duration-300 ${
          holdExpired
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : secondsRemaining !== null && secondsRemaining < 60
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Clock className={`w-4 h-4 ${holdExpired ? 'text-rose-600' : 'text-indigo-600'}`} />
            <span>{holdExpired ? 'Hold Expired' : 'Slot Temporarily Reserved'}</span>
          </div>
          {secondsRemaining !== null && !holdExpired && (
            <span className="font-mono font-bold text-xs px-2.5 py-1 bg-white/90 rounded-md border border-indigo-200 shadow-2xs">
              {Math.floor(secondsRemaining / 60)}:
              {(secondsRemaining % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>

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
            : 'This slot is held while you complete your details.'}
        </p>

        {holdExpired && (
          <button
            onClick={onReset}
            className="mt-3 px-4 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition"
          >
            Select a Fresh Slot
          </button>
        )}
      </div>

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

      <form onSubmit={onConfirm} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            required
            disabled={holdExpired || submitting}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            required
            disabled={holdExpired || submitting}
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="jane@company.com"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100"
          />
        </div>

        <button
          type="submit"
          disabled={holdExpired || submitting}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
          <span>Confirm Booking</span>
        </button>
      </form>
    </div>
  );
}
