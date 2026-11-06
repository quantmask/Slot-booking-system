import React, { useState, useEffect } from 'react';
import PublicBooking from './components/PublicBooking.js';
import ManageBooking from './components/ManageBooking.js';
import HostDashboard from './components/HostDashboard.js';
import { Calendar, User, ShieldCheck } from 'lucide-react';

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

    // 4. Default Home Landing Page: Quick navigation to demo surfaces
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full text-xs font-semibold mb-3">
            <ShieldCheck className="w-4 h-4" /> Zero Double-Booking Guaranteed
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Slotbook Scheduler
          </h1>
          <p className="mt-3 text-base text-slate-600 max-w-xl mx-auto">
            High-reliability scheduling engine with strict ACID serialization, GiST exclusion constraints,
            and DST-aware time zone resolution.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate('/alex/quick-catchup')}
            className="p-6 bg-white border border-slate-200 rounded-2xl text-left hover:border-indigo-500 hover:shadow-md transition group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Public Booking Flow</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">1-on-1</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600">
              Quick Catchup (30m)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Book a slot with seeded host Alex. Includes live 5-minute hold timer and manage link.
            </p>
          </button>

          <button
            onClick={() => navigate('/alex/group-workshop')}
            className="p-6 bg-white border border-slate-200 rounded-2xl text-left hover:border-indigo-500 hover:shadow-md transition group"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Group Booking Flow</span>
              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">Cap: 3</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600">
              Group Workshop (60m)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Group session with 3 concurrent seats. Demonstrates seat counter and lazy session sharing.
            </p>
          </button>
        </div>

        <div className="p-6 bg-slate-900 text-white rounded-2xl flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-bold text-lg">Host Dashboard</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sign in as alex@example.com (password123) to manage event types, weekly hours, and overrides.
            </p>
          </div>
          <button
            onClick={() => navigate('/host')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs transition"
          >
            Open Host Dashboard →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-black text-slate-900 text-lg hover:text-indigo-600 transition"
          >
            <Calendar className="w-5 h-5 text-indigo-600" />
            <span>Slotbook</span>
          </button>

          <nav className="flex items-center gap-3 text-xs font-semibold">
            <button
              onClick={() => navigate('/alex/quick-catchup')}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              Catchup (1-on-1)
            </button>
            <button
              onClick={() => navigate('/alex/group-workshop')}
              className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition"
            >
              Workshop (Group)
            </button>
            <button
              onClick={() => navigate('/host')}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5" /> Host
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {renderRoute()}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Slotbook • High-Reliability Scheduler • Backed by PostgreSQL 15+
      </footer>
    </div>
  );
}
