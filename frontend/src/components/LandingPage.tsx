import { ShieldCheck, Clock, Globe, ArrowRight, Sliders, ChevronRight } from 'lucide-react';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-12">
      <div className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-full text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Live Availability Infrastructure</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Meetings scheduled without friction
        </h1>

        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Share your personalized booking link and allow clients or partners to book focused sessions with automated buffer protection and calendar synchronization.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-medium text-slate-700">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Zero Double Bookings</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <Clock className="w-4 h-4 text-slate-700" />
            <span>Automated Buffer Protection</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <Globe className="w-4 h-4 text-emerald-600" />
            <span>Timezone Intelligence</span>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Featured Host Calendar</h2>
            <p className="text-xs text-slate-500">Dr. Alexander Wright | Advisory Partner & Principal Architect</p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Available for Booking
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-indigo-500 hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg uppercase tracking-wider">
                  Executive 1 on 1
                </span>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                  Individual Session
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900">
                Executive Strategy Consultation
              </h3>

              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Confidential strategy and roadmap guidance session with an automated 15 minute post meeting buffer window to ensure discussions never overlap.
              </p>

              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Duration</span>
                  <span className="font-semibold text-slate-900">30 minutes</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Notice Required</span>
                  <span className="font-semibold text-slate-900">4 hours minimum</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Buffer Protection</span>
                  <span className="font-semibold text-slate-900">15 min buffer</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Booking Window</span>
                  <span className="font-semibold text-slate-900">30 day horizon</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('/alex/quick-catchup')}
              className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2"
            >
              <span>Select a Time</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-slate-800 hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-3">
                <span className="px-2.5 py-1 bg-slate-100 text-slate-800 text-xs font-bold rounded-lg uppercase tracking-wider">
                  Group Review
                </span>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                  3 Seats Available
                </span>
              </div>

              <h3 className="text-xl font-bold text-slate-900">
                Architecture & Product Review
              </h3>

              <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                Collaborative technical review session. Multiple team members can reserve individual spots until the group capacity fills.
              </p>

              <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Duration</span>
                  <span className="font-semibold text-slate-900">60 minutes</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Notice Required</span>
                  <span className="font-semibold text-slate-900">24 hours minimum</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Buffer Protection</span>
                  <span className="font-semibold text-slate-900">15 min before & after</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Capacity</span>
                  <span className="font-semibold text-slate-900">Up to 3 attendees</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('/alex/group-workshop')}
              className="mt-6 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2"
            >
              <span>Reserve a Spot</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-3">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">Deterministic Conflict Prevention</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Real-time slot locking ensures appointments and buffer periods never collide during simultaneous booking surges.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center mb-3">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">Global Timezone Resolution</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Automatic local timezone conversion cleanly calculates availability across Daylight Saving Time transitions.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
            <Sliders className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">Custom Calendar Controls</h3>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            Define weekly recurring business hours, date overrides, external calendar sync, and advance notice rules.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-3xl p-7 border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="max-w-xl">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
            Host Portal
          </span>
          <h3 className="text-xl sm:text-2xl font-bold mt-1 text-white">
            Manage Your Schedule and Appointments
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
            Configure weekly operating hours, register external busy times, view waitlists, and manage upcoming client reservations.
          </p>
        </div>

        <button
          onClick={() => onNavigate('/host')}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md transition whitespace-nowrap flex items-center gap-2"
        >
          <span>Open Host Portal</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
