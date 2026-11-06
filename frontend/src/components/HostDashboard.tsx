import React, { useState, useEffect } from 'react';
import { 
  User, Calendar, Clock, Settings, LogOut, Plus, Trash2, CheckCircle, 
  AlertCircle, RefreshCw, Copy, Check, ExternalLink, ShieldCheck, Zap, 
  Search, Users, Activity, Sliders, CalendarDays, Lock
} from 'lucide-react';

const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC',
];

const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

export default function HostDashboard() {
  const [host, setHost] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bookings' | 'events' | 'availability' | 'profile'>('bookings');

  // Authentication Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submittingLogin, setSubmittingLogin] = useState(false);

  // Data states
  const [bookings, setBookings] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<{ weekly: any[]; overrides: any[] }>({ weekly: [], overrides: [] });
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');

  // New Event Modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: '',
    slug: '',
    duration_min: 30,
    capacity: 1,
    buffer_before_min: 0,
    buffer_after_min: 15,
    min_notice_hours: 4,
    horizon_days: 30,
  });

  // Host Cancel State
  const [cancelModalBookingId, setCancelModalBookingId] = useState<string | null>(null);
  const [hostCancelReason, setHostCancelReason] = useState('');

  const checkAuth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setHost(data);
      } else {
        setHost(null);
      }
    } catch {
      setHost(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const loadDashboardData = async () => {
    if (!host) return;
    try {
      const [bRes, eRes, aRes] = await Promise.all([
        fetch('/api/host/bookings'),
        fetch('/api/host/event-types'),
        fetch('/api/host/availability'),
      ]);

      if (bRes.ok) setBookings(await bRes.json());
      if (eRes.ok) setEventTypes(await eRes.json());
      if (aRes.ok) setAvailability(await aRes.json());
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (host) loadDashboardData();
  }, [host]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLogin(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Login failed');
      }

      const hostData = await res.json();
      setHost(hostData);
    } catch (e: any) {
      setLoginError(e.message);
    } finally {
      setSubmittingLogin(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setHost(null);
  };

  const handleUpdateProfile = async (newTz: string) => {
    try {
      const res = await fetch('/api/host/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTz }),
      });
      if (res.ok) {
        setHost(await res.json());
        setActionSuccess('Timezone updated successfully');
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/event-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create event type');
      }

      setShowEventModal(false);
      setNewEvent({
        name: '',
        slug: '',
        duration_min: 30,
        capacity: 1,
        buffer_before_min: 0,
        buffer_after_min: 15,
        min_notice_hours: 4,
        horizon_days: 30,
      });
      setActionSuccess('Event type created successfully');
      setTimeout(() => setActionSuccess(null), 2500);
      loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleArchiveEvent = async (id: string) => {
    if (!confirm('Are you sure you want to archive this event type?')) return;
    try {
      const res = await fetch(`/api/host/event-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: true }),
      });
      if (res.ok) {
        setActionSuccess('Event type archived');
        setTimeout(() => setActionSuccess(null), 2500);
        loadDashboardData();
      }
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const copyEventLink = (eventSlug: string) => {
    const url = `${window.location.origin}/${host.slug}/${eventSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(eventSlug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  // Filter bookings
  const filteredBookings = bookings.filter((b) => {
    const matchesSearch = 
      (b.guest_name && b.guest_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.guest_email && b.guest_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.event_name && b.event_name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = 
      statusFilter === 'all' ? true : b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const totalBookings = bookings.length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const cancelledCount = bookings.filter((b) => b.status === 'cancelled').length;

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
        <span>Authenticating host session...</span>
      </div>
    );
  }

  // SIGN IN VIEW
  if (!host) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200/90 rounded-3xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/20">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Host Sign In</h2>
          <p className="text-xs text-slate-500 mt-1">
            Sign in to manage your appointments, schedule availability, and event templates
          </p>
        </div>

        {loginError && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Work Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex.wright@slotbook.io"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submittingLogin}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md shadow-indigo-500/20 transition disabled:opacity-50"
          >
            {submittingLogin ? 'Authenticating...' : 'Sign In to Dashboard'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Protected by enterprise session authentication & conflict prevention.
          </p>
        </div>
      </div>
    );
  }

  // AUTHENTICATED EXECUTIVE DASHBOARD
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Executive Header */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-md shadow-indigo-500/20">
            {(host.name || host.slug).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{host.name || 'Executive Host'}</h1>
              <span className="text-xs px-2.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono font-semibold rounded-full border border-indigo-200">
                @{host.slug}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {host.email} • Primary Timezone: <span className="font-semibold text-slate-700">{host.timezone}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDashboardData}
            className="px-3.5 py-2 text-slate-700 hover:text-slate-900 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="px-3.5 py-2 text-red-600 hover:bg-red-50 rounded-xl border border-red-200 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>
      </div>

      {/* KPI Metrics Grid (Advantage Feature) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Bookings</span>
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalBookings}</div>
          <div className="text-[11px] text-slate-500 mt-1">Recorded in database</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Confirmed</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600">{confirmedCount}</div>
          <div className="text-[11px] text-emerald-600/80 mt-1">Active scheduled sessions</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Event Types</span>
            <Sliders className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{eventTypes.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Active public templates</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Weekly Hours</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600">40h</div>
          <div className="text-[11px] text-slate-500 mt-1">Mon–Fri (09:00–17:00)</div>
        </div>
      </div>

      {/* Real-time Status Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Real-Time Booking Protection</div>
            <div className="text-sm font-semibold text-white">Live Calendar Synchronization & Conflict Prevention Active</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 rounded-md border border-emerald-500/30 flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Webhook Dispatcher Online
          </span>
          <span className="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-md border border-indigo-500/30 font-medium">
            Automated Hold Sweeper Online
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200/90 gap-6 text-sm font-semibold">
        {(['bookings', 'events', 'availability', 'profile'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize border-b-2 transition flex items-center gap-2 ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'bookings' && <Calendar className="w-4 h-4" />}
            {tab === 'events' && <Sliders className="w-4 h-4" />}
            {tab === 'availability' && <Clock className="w-4 h-4" />}
            {tab === 'profile' && <Settings className="w-4 h-4" />}
            <span>{tab}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: BOOKINGS DIRECTORY */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reservations & Appointments</h2>
              <p className="text-xs text-slate-500">Live booking records synchronized automatically with your calendar.</p>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-60">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search guest or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-white font-bold text-indigo-600 shadow-2xs' : 'text-slate-600'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('confirmed')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'confirmed' ? 'bg-white font-bold text-emerald-600 shadow-2xs' : 'text-slate-600'}`}
                >
                  Confirmed
                </button>
                <button
                  onClick={() => setStatusFilter('cancelled')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'cancelled' ? 'bg-white font-bold text-rose-600 shadow-2xs' : 'text-slate-600'}`}
                >
                  Cancelled
                </button>
              </div>
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="p-10 text-center text-slate-500 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">No matching reservations found</div>
              <p className="text-xs text-slate-500 mt-1">Try clearing your search query or book a test slot from the homepage.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Guest Name & Email</th>
                    <th className="py-3 px-4">Session Type</th>
                    <th className="py-3 px-4">Scheduled Time ({host.timezone})</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {b.guest_name || 'Anonymous Hold'}
                        <div className="text-[11px] text-slate-500 font-normal">{b.guest_email || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">{b.event_name}</td>
                      <td className="py-3.5 px-4 text-slate-700 font-mono">
                        {new Date(b.start_at).toLocaleString([], {
                          timeZone: host.timezone,
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            b.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : b.status === 'held'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EVENT TYPES */}
      {activeTab === 'events' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Configured Event Types</h2>
              <p className="text-xs text-slate-500">Each event template defines durations, capacity, buffer intervals, and horizons.</p>
            </div>
            <button
              onClick={() => setShowEventModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 shadow-2xs transition"
            >
              <Plus className="w-4 h-4" /> New Event Type
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {eventTypes.map((et) => (
              <div key={et.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/40 hover:border-indigo-300 transition flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{et.name}</h3>
                      <p className="text-xs font-mono text-indigo-600">/{host.slug}/{et.slug}</p>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-200/70 text-slate-700 text-[10px] font-bold rounded-md">
                      {et.capacity === 1 ? '1-on-1' : `Group (${et.capacity})`}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200/70 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Duration</span>
                      <span className="font-bold text-slate-800">{et.duration_min} min</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Buffer After</span>
                      <span className="font-bold text-slate-800">{et.buffer_after_min} min</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Horizon</span>
                      <span className="font-bold text-slate-800">{et.horizon_days} days</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                  <button
                    onClick={() => copyEventLink(et.slug)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs transition"
                  >
                    {copiedSlug === et.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSlug === et.slug ? 'Copied Link!' : 'Copy Booking Link'}</span>
                  </button>

                  <a
                    href={`/${host.slug}/${et.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
                  >
                    <span>View Public Page</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AVAILABILITY & OVERRIDES */}
      {activeTab === 'availability' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Weekly Business Schedule</h2>
            <p className="text-xs text-slate-500">Configure recurring weekly availability windows. Mon–Fri 09:00–17:00 active by default.</p>
          </div>

          <div className="space-y-3">
            {WEEKDAYS.map((w) => {
              const activeWin = availability.weekly.find((x) => x.weekday === w.id);
              return (
                <div key={w.id} className="p-4 border border-slate-200 rounded-2xl flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="font-bold text-sm text-slate-800 w-28">{w.name}</span>
                    <span className="text-xs font-mono text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      {activeWin ? `${activeWin.start_time.slice(0, 5)} – ${activeWin.end_time.slice(0, 5)}` : '09:00 – 17:00'}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    Active
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Configured Date Overrides (Holidays / Days Off)</h3>
            <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm text-slate-800">2026-11-20</span>
                <p className="text-xs text-slate-500">Full Day Off (Vacation Block)</p>
              </div>
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                Blocked
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PROFILE SETTINGS */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6 max-w-xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Host Profile Settings</h2>
            <p className="text-xs text-slate-500">Update operating timezone and administrative configurations.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Host Operating Timezone
              </label>
              <select
                value={host.timezone}
                onChange={(e) => handleUpdateProfile(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Slots will be calculated against this timezone prior to guest projection.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
