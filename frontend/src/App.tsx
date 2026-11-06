import { useState, useEffect } from 'react';
import PublicBooking from './components/PublicBooking.js';
import ManageBooking from './components/ManageBooking.js';
import HostDashboard from './components/HostDashboard.js';
import LandingPage from './components/LandingPage.js';
import { Calendar, User } from 'lucide-react';

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

  const renderRoute = () => {
    const embedMatch = currentPath.match(/^\/embed\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (embedMatch) {
      return <PublicBooking hostSlug={embedMatch[1]} eventSlug={embedMatch[2]} isEmbedded={true} />;
    }

    const manageMatch = currentPath.match(/^\/manage\/([a-zA-Z0-9_-]+)/);
    if (manageMatch) {
      return <ManageBooking token={manageMatch[1]} />;
    }

    if (currentPath === '/host' || currentPath.startsWith('/host/')) {
      return <HostDashboard />;
    }

    const bookingMatch = currentPath.match(/^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (bookingMatch && bookingMatch[1] !== 'api') {
      return <PublicBooking hostSlug={bookingMatch[1]} eventSlug={bookingMatch[2]} />;
    }

    return <LandingPage onNavigate={navigate} />;
  };

  if (isEmbedMode) {
    return (
      <div className="min-h-screen bg-transparent p-2 font-sans">
        {renderRoute()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {renderRoute()}
      </main>

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
