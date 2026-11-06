import { useState } from 'react';
import { CheckCircle, Download, CalendarPlus, ShieldCheck, Copy, Check } from 'lucide-react';
import { downloadIcsFile, getGoogleCalendarUrl } from '../../lib/calendar.js';

interface BookingSuccessProps {
  confirmedBooking: {
    event_name: string;
    guest_name: string;
    guest_email: string;
    start_at: string;
    end_at: string;
    token: string;
  };
  hostSlug: string;
  guestTz: string;
  onBookAnother: () => void;
}

export default function BookingSuccess({
  confirmedBooking,
  hostSlug,
  guestTz,
  onBookAnother,
}: BookingSuccessProps) {
  const [copied, setCopied] = useState(false);
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
    details: `Scheduled with @${hostSlug} via Slotbook.\nManage: ${manageUrl}`,
  });

  const copyManageLink = () => {
    navigator.clipboard.writeText(manageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-lg text-center animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-emerald-100">
        <CheckCircle className="w-9 h-9" />
      </div>

      <span className="px-3 py-1 bg-emerald-100/80 text-emerald-800 text-xs font-bold rounded-full uppercase tracking-wider">
        Booking Confirmed
      </span>

      <h2 className="text-3xl font-extrabold text-slate-900 mt-3">You're Scheduled</h2>
      <p className="text-slate-600 text-sm mt-1.5">
        A calendar invitation and confirmation record have been generated.
      </p>

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
          <span className="font-semibold text-slate-800">
            {confirmedBooking.guest_name} ({confirmedBooking.guest_email})
          </span>
        </div>
        <div className="flex justify-between items-start">
          <span className="text-slate-500 font-medium">Time ({guestTz}):</span>
          <span className="font-bold text-indigo-700 text-right">{formattedStartTime}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <button
          onClick={() =>
            downloadIcsFile({
              title: confirmedBooking.event_name,
              startIso: confirmedBooking.start_at,
              endIso: confirmedBooking.end_at,
              description: `Meeting with @${hostSlug}.\nManage: ${manageUrl}`,
              guestName: confirmedBooking.guest_name,
            })
          }
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
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>
        <p className="text-xs font-mono text-indigo-950 break-all select-all bg-white p-2.5 rounded-lg border border-indigo-100">
          {manageUrl}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={manageUrl}
          className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition"
        >
          Manage or Reschedule
        </a>
        <button
          onClick={onBookAnother}
          className="py-2.5 px-5 bg-white border border-slate-300 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition"
        >
          Book Another Session
        </button>
      </div>
    </div>
  );
}
