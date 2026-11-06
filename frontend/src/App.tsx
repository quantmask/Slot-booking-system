import React, { useState, useEffect } from 'react';
import PublicBooking from './components/PublicBooking.js';
import ManageBooking from './components/ManageBooking.js';
import HostDashboard from './components/HostDashboard.js';
import { 
  Calendar, User, Clock, ShieldCheck, Globe, ArrowRight, 
  CheckCircle2, ChevronRight, Sliders, Shield
} from 'lucide-react';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const isEmbedMode = currentPath.startsWith('/embed/');

  // Route matching
  const renderRoute = () => {
    // 0. Embed route: /embed/:host/:slug
    const embedMatch = currentPath.match(/^\/embed\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) {
      return <PublicBooking hostSlug={embedMatch[1]} eventSlug={embedMatch[2]} isEmbedded={true} />;
    }

    // 1. Manage route: /manage/:token
    const manageMatch = currentPath.match(/^\/manage\/([a-zA-Z0-9_-]+)/);
    if (manageMatch) {
      return <ManageBooking token={manageMatch[1]} />;
    }

    // 2. Host dashboard: /host
    if (currentPath === '/host' || currentPath.startsWith('/host/')) {
      return <HostDashboard />;
    }

    // 3. Public booking: /:host/:slug
    const bookingMatch = currentPath.match(/^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (bookingMatch && bookingMatch[1] !== 'api') {
      return <PublicBooking hostSlug={bookingMatch[1]} eventSlug={bookingMatch[2]} />;
    }

    // 4. Default Home Landing Page
    return (
      <div className="max-w-5xl mx-auto space-y-12">
        {/* Clean Hero Section */}
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

          {/* Clean Metric Indicators */}
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

        {/* Featured Scheduling Calendars */}
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
            {/* Session 1: 1-on-1 Advisory */}
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
                onClick={() => navigate('/alex/quick-catchup')}
                className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2"
              >
                <span>Select a Time</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Session 2: Group Architecture Review */}
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
                onClick={() => navigate('/alex/group-workshop')}
                className="mt-6 w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2"
              >
                <span>Reserve a Spot</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
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

        {/* Host Access Banner */}
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
            onClick={() => navigate('/host')}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs sm:text-sm shadow-md transition whitespace-nowrap flex items-center gap-2"
          >
            <span>Open Host Portal</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // If in embed mode, render component directly without surrounding layout
  if (isEmbedMode) {
    return (
      <div className="min-h-screen bg-transparent p-2 font-sans">
        {renderRoute()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Global Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm group-hover:bg-indigo-600 transition">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 tracking-tight leading-none">
                Slotbook
              </div>
              <div className="text-[10px] font-semibold text-slate-500 tracking-wider uppercase mt-0.5">
                Calendar Infrastructure
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/host')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl transition shadow-2xs"
            >
              <User className="w-3.5 h-3.5" />
              <span>Host Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {renderRoute()}
      </main>

      {/* Global Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Slotbook Engine</span>
            <span>|</span>
            <span>Enterprise Scheduling Platform</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Verified Reliability</span>
            <span>|</span>
            <span>Dual-Tier Concurrency</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
