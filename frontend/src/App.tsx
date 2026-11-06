import React, { useState, useEffect } from 'react';
import PublicBooking from './components/PublicBooking.js';
import ManageBooking from './components/ManageBooking.js';
import HostDashboard from './components/HostDashboard.js';
import { 
  Calendar, User, Clock, ShieldCheck, Globe, ArrowRight, 
  Sparkles, CheckCircle2, ChevronRight, Layers, Lock, Sliders 
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

  // Route matching
  const renderRoute = () => {
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
        {/* Hero Section */}
        <div className="text-center pt-8 pb-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50/90 border border-indigo-200/70 text-indigo-700 rounded-full text-xs font-semibold mb-5 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Intelligent Scheduling for High-Performance Teams</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
            Effortless Coordination <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 bg-clip-text text-transparent">
              Zero Scheduling Conflicts
            </span>
          </h1>

          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            Eliminate back-and-forth emails. Share your personalized scheduling link and let clients, 
            partners, and candidates book focused time with automated buffer protection and instant calendar sync.
          </p>

          {/* Value Highlights Grid */}
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs font-medium text-slate-600">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Conflict-Free Guarantee
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-purple-600" /> Automated Buffer Windows
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs">
              <Globe className="w-3.5 h-3.5 text-emerald-600" /> Global Timezone Intelligence
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-lg shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" /> 1-Click Calendar Invites
            </div>
          </div>
        </div>

        {/* Featured Scheduling Profiles */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Featured Host Calendar</h2>
              <p className="text-xs text-slate-500">Dr. Alexander Wright • Advisory Partner & Principal Architect</p>
            </div>
            <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Available for Booking
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Template 1: 1-on-1 Advisory */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:border-indigo-400 hover:shadow-md transition group flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-md uppercase tracking-wider">
                    Executive 1-on-1
                  </span>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Individual
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition">
                  Executive Strategy Consultation
                </h3>

                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Confidential strategy and roadmap guidance session. Includes an automated 15-minute buffer after the meeting to ensure conversations never run over.
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div><span className="text-slate-400">Duration:</span> <span className="font-semibold text-slate-800">30 minutes</span></div>
                  <div><span className="text-slate-400">Notice Required:</span> <span className="font-semibold text-slate-800">4 hours</span></div>
                  <div><span className="text-slate-400">Buffer Protection:</span> <span className="font-semibold text-slate-800">15m after</span></div>
                  <div><span className="text-slate-400">Availability:</span> <span className="font-semibold text-slate-800">Next 30 days</span></div>
                </div>
              </div>

              <button
                onClick={() => navigate('/alex/quick-catchup')}
                className="mt-6 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2 group-hover:shadow-indigo-500/20"
              >
                <span>Select a Time</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </button>
            </div>

            {/* Template 2: Group Technical Workshop */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:border-purple-400 hover:shadow-md transition group flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-md uppercase tracking-wider">
                    Group Session
                  </span>
                  <span className="text-xs font-bold text-purple-700 bg-purple-100/70 px-2.5 py-0.5 rounded-full">
                    3 Seats Available
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition">
                  Architecture & Product Review
                </h3>

                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Multi-seat collaborative architectural review. Multiple team members can reserve individual spots until the group capacity is filled.
                </p>

                <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div><span className="text-slate-400">Duration:</span> <span className="font-semibold text-slate-800">60 minutes</span></div>
                  <div><span className="text-slate-400">Notice Required:</span> <span className="font-semibold text-slate-800">24 hours</span></div>
                  <div><span className="text-slate-400">Buffer Windows:</span> <span className="font-semibold text-slate-800">15m before & after</span></div>
                  <div><span className="text-slate-400">Availability:</span> <span className="font-semibold text-slate-800">Next 30 days</span></div>
                </div>
              </div>

              <button
                onClick={() => navigate('/alex/group-workshop')}
                className="mt-6 w-full py-2.5 bg-slate-900 hover:bg-purple-700 text-white font-medium rounded-xl text-sm shadow-2xs transition flex items-center justify-center gap-2 group-hover:shadow-purple-500/20"
              >
                <span>Reserve a Spot</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </button>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Deterministic Conflict Prevention</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Real-time slot locking ensures meetings and buffer periods never collide, even during high-traffic booking rushes.
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-3">
              <Globe className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Intelligent Timezone Resolution</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Automatically adjusts for client timezones and seamlessly handles Daylight Saving Time transitions without scheduling errors.
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-3">
              <Sliders className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm">Flexible Calendar Control</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Customizable weekly operating hours, date-specific overrides, vacation blocks, and granular advance notice limits.
            </p>
          </div>
        </div>

        {/* Host Access Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="max-w-xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
              Host Portal
            </span>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 text-white">
              Manage Your Schedule & Bookings
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
              Configure your weekly working hours, set holidays, customize meeting durations, and manage upcoming client reservations.
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Global Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 tracking-tight leading-none">
                Slotbook
              </div>
              <div className="text-[10px] font-semibold text-indigo-600 tracking-wider uppercase">
                Smart Scheduling
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Real-Time Availability
            </div>

            <button
              onClick={() => navigate('/host')}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-lg transition shadow-2xs"
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
            <span className="font-semibold text-slate-700">Slotbook Technologies Inc.</span>
            <span>•</span>
            <span>Enterprise Scheduling Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Privacy Policy</span>
            <span>•</span>
            <span>Terms of Service</span>
            <span>•</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
