import React from 'react';
import { UserPlus, X } from 'lucide-react';

interface WaitlistModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  waitlistName: string;
  setWaitlistName: (name: string) => void;
  waitlistEmail: string;
  setWaitlistEmail: (email: string) => void;
  submitting: boolean;
  successMessage: string | null;
}

export default function WaitlistModal({
  show,
  onClose,
  onSubmit,
  waitlistName,
  setWaitlistName,
  waitlistEmail,
  setWaitlistEmail,
  submitting,
  successMessage,
}: WaitlistModalProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Join Priority Waitlist</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          If an attendee cancels or reschedules, you will be placed next in line and granted a 10-minute priority hold.
        </p>

        {successMessage ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
            {successMessage}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3.5">
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
              disabled={submitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-sm transition disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Register for Waitlist'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
