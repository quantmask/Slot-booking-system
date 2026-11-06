import { useState, useEffect } from 'react';
import { 
  Calendar, Clock, Settings, LogOut, Plus, Trash2, CheckCircle, 
  AlertCircle, RefreshCw, Copy, Check, ExternalLink, 
  Sliders, CalendarDays, Lock, Code, Radio, UserCheck, X
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
  const [activeTab, setActiveTab] = useState<'bookings' | 'events' | 'availability' | 'calendars' | 'webhooks' | 'waitlist' | 'profile'>('bookings');

  // Authentication Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submittingLogin, setSubmittingLogin] = useState(false);

  // Core Data states
  const [bookings, setBookings] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<{ weekly: any[]; overrides: any[] }>({ weekly: [], overrides: [] });
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Optional Extension Data states
  const [busyTimes, setBusyTimes] = useState<any[]>([]);
  const [newBusyTitle, setNewBusyTitle] = useState('External Focus');
  const [newBusyStart, setNewBusyStart] = useState('');
  const [newBusyEnd, setNewBusyEnd] = useState('');
  const [icsText, setIcsText] = useState('');

  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [waitlists, setWaitlists] = useState<any[]>([]);
  const [embedModalSlug, setEmbedModalSlug] = useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

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
      const [bRes, eRes, aRes, busyRes, hookRes, hookLogRes, waitRes] = await Promise.all([
        fetch('/api/host/bookings'),
        fetch('/api/host/event-types'),
        fetch('/api/host/availability'),
        fetch('/api/host/busy-times'),
        fetch('/api/host/webhooks'),
        fetch('/api/host/webhooks/logs'),
        fetch('/api/host/waitlists'),
      ]);

      if (bRes.ok) setBookings(await bRes.json());
      if (eRes.ok) setEventTypes(await eRes.json());
      if (aRes.ok) setAvailability(await aRes.json());
      if (busyRes.ok) setBusyTimes(await busyRes.json());
      if (hookRes.ok) setWebhooks(await hookRes.json());
      if (hookLogRes.ok) setWebhookLogs(await hookLogRes.json());
      if (waitRes.ok) setWaitlists(await waitRes.json());
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

  // Extension: External Busy Times Handlers
  const handleCreateBusyTime = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/busy-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newBusyTitle,
          start_at: new Date(newBusyStart).toISOString(),
          end_at: new Date(newBusyEnd).toISOString(),
        }),
      });
      if (res.ok) {
        setActionSuccess('External busy window created');
        setNewBusyStart('');
        setNewBusyEnd('');
        loadDashboardData();
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleImportIcs = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/busy-times/import-ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsContent: icsText }),
      });
      if (res.ok) {
        const d = await res.json();
        setActionSuccess(`Imported ${d.imported} external calendar blocks`);
        setIcsText('');
        loadDashboardData();
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (err: any) {
      setActionError(err.message);
    }
  };

  const handleDeleteBusyTime = async (id: string) => {
    await fetch(`/api/host/busy-times/${id}`, { method: 'DELETE' });
    loadDashboardData();
  };

  // Extension: Webhook Handlers
  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/host/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      if (res.ok) {
        setActionSuccess('Webhook registered with HMAC secret');
        setWebhookUrl('');
        loadDashboardData();
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (err: any) {
      setActionError(err.message);
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

  const totalBookings = bookings.length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-700" />
        <span>Authenticating host session...</span>
      </div>
    );
  }

  // SIGN IN VIEW
  if (!host) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Host Sign In</h2>
          <p className="text-xs text-slate-500 mt-1">
            Sign in to manage your appointments, availability, and event templates
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
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Work Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex.wright@slotbook.io"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submittingLogin}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
          >
            {submittingLogin ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Protected by enterprise session authentication.
          </p>
        </div>
      </div>
    );
  }

  // AUTHENTICATED DASHBOARD
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center font-bold text-lg">
            {(host.name || host.slug).charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{host.name || 'Executive Host'}</h1>
              <span className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 font-mono font-medium rounded-full">
                @{host.slug}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {host.email} | Primary Timezone: <span className="font-semibold text-slate-700">{host.timezone}</span>
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

      {/* KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Bookings</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalBookings}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Recorded in calendar</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Confirmed</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{confirmedCount}</div>
          <div className="text-[11px] text-emerald-600/70 mt-0.5">Active upcoming sessions</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Event Types</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{eventTypes.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Public booking templates</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Weekly Schedule</span>
          <div className="text-2xl font-bold text-indigo-600 mt-1">40h</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Mon to Fri, 9am to 5pm</div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs sm:text-sm font-semibold overflow-x-auto">
        {(['bookings', 'events', 'availability', 'calendars', 'webhooks', 'waitlist', 'profile'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab
                ? 'border-slate-900 text-slate-900 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab === 'bookings' && <Calendar className="w-4 h-4" />}
            {tab === 'events' && <Sliders className="w-4 h-4" />}
            {tab === 'availability' && <Clock className="w-4 h-4" />}
            {tab === 'calendars' && <CalendarDays className="w-4 h-4" />}
            {tab === 'webhooks' && <Radio className="w-4 h-4" />}
            {tab === 'waitlist' && <UserCheck className="w-4 h-4" />}
            {tab === 'profile' && <Settings className="w-4 h-4" />}
            <span>{tab === 'calendars' ? 'External Busy Times' : tab}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: BOOKINGS */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Reservations</h2>
              <p className="text-xs text-slate-500">Live booking records synchronized with your calendar.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search guest or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none sm:w-56"
              />

              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'}`}
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
            <div className="p-10 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl">
              <Calendar className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">No matching reservations found</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Guest</th>
                    <th className="py-3 px-4">Session</th>
                    <th className="py-3 px-4">Scheduled Time ({host.timezone})</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {b.guest_name || 'Anonymous'}
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
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
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
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Event Types</h2>
              <p className="text-xs text-slate-500">Durations, buffer protection, and embed codes.</p>
            </div>
            <button
              onClick={() => setShowEventModal(true)}
              className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" /> New Event Type
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventTypes.map((et) => (
              <div key={et.id} className="p-5 border border-slate-200 rounded-2xl bg-white hover:border-slate-300 transition flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-base text-slate-900">{et.name}</h3>
                      <p className="text-xs font-mono text-indigo-600">/{host.slug}/{et.slug}</p>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                      {et.capacity === 1 ? '1 on 1' : `Group (${et.capacity})`}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs text-slate-600">
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

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyEventLink(et.slug)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition"
                    >
                      {copiedSlug === et.slug ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSlug === et.slug ? 'Copied' : 'Copy Link'}</span>
                    </button>

                    <button
                      onClick={() => setEmbedModalSlug(et.slug)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 transition"
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span>Embed Widget</span>
                    </button>
                  </div>

                  <a
                    href={`/${host.slug}/${et.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
                  >
                    <span>View Page</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: AVAILABILITY */}
      {activeTab === 'availability' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Weekly Operating Schedule</h2>
            <p className="text-xs text-slate-500">Recurring weekly availability windows configured in {host.timezone}.</p>
          </div>

          <div className="space-y-2.5">
            {WEEKDAYS.map((w) => {
              const activeWin = availability.weekly.find((x) => x.weekday === w.id);
              return (
                <div key={w.id} className="p-3.5 border border-slate-200 rounded-2xl flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="font-semibold text-sm text-slate-800 w-28">{w.name}</span>
                    <span className="text-xs font-mono text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      {activeWin ? `${activeWin.start_time.slice(0, 5)} to ${activeWin.end_time.slice(0, 5)}` : '09:00 to 17:00'}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    Active
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: EXTERNAL BUSY TIMES (Optional Extension) */}
      {activeTab === 'calendars' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">External Busy Blocks & Calendar Import</h2>
            <p className="text-xs text-slate-500">
              Blocks imported here automatically remove overlapping slots to prevent conflicts with your personal calendar.
            </p>
          </div>

          {/* Manual Add Block */}
          <form onSubmit={handleCreateBusyTime} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Add Manual Busy Window</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Block Title</label>
                <input
                  type="text"
                  required
                  value={newBusyTitle}
                  onChange={(e) => setNewBusyTitle(e.target.value)}
                  placeholder="e.g. Executive Board Meeting"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Time (UTC or ISO)</label>
                <input
                  type="datetime-local"
                  required
                  value={newBusyStart}
                  onChange={(e) => setNewBusyStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={newBusyEnd}
                  onChange={(e) => setNewBusyEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition"
            >
              Add Busy Block
            </button>
          </form>

          {/* Paste RFC 5545 .ics Feed */}
          <form onSubmit={handleImportIcs} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Import .ics File or Calendar Feed</h3>
            <p className="text-xs text-slate-500">Paste your exported Apple Calendar or Google Calendar .ics content:</p>
            <textarea
              rows={3}
              value={icsText}
              onChange={(e) => setIcsText(e.target.value)}
              placeholder="BEGIN:VCALENDAR... BEGIN:VEVENT... END:VEVENT... END:VCALENDAR"
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!icsText.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
            >
              Import VEVENT Blocks
            </button>
          </form>

          {/* List Busy Times */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Active Busy Blocks ({busyTimes.length})</h3>
            {busyTimes.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No external busy blocks recorded.</p>
            ) : (
              <div className="space-y-2">
                {busyTimes.map((bt) => (
                  <div key={bt.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between text-xs bg-white">
                    <div>
                      <span className="font-bold text-slate-800">{bt.title}</span>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {new Date(bt.start_at).toLocaleString([], { timeZone: host.timezone })} to {new Date(bt.end_at).toLocaleString([], { timeZone: host.timezone })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteBusyTime(bt.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: WEBHOOKS & HMAC LOGS (Optional Extension) */}
      {activeTab === 'webhooks' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Custom Webhooks & HMAC Signatures</h2>
            <p className="text-xs text-slate-500">
              Receive signed booking events directly to your endpoint with cryptographic SHA-256 HMAC verification.
            </p>
          </div>

          <form onSubmit={handleSaveWebhook} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Register Endpoint</h3>
            <div className="flex gap-2">
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/webhooks/slotbook"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition"
              >
                Register Webhook
              </button>
            </div>
          </form>

          {/* Configured Webhooks */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Configured Endpoints</h3>
            {webhooks.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No webhooks registered.</p>
            ) : (
              <div className="space-y-3">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="p-4 border border-slate-200 rounded-xl bg-white space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900 font-mono">{wh.url}</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-full text-[10px]">Active</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="text-[11px] font-semibold text-slate-600">HMAC Secret:</span>
                      <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] text-slate-800">{wh.secret_key}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(wh.secret_key);
                          setCopiedSecret(true);
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 text-[11px] font-medium"
                      >
                        {copiedSecret ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Logs */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">Recent Delivery Log</h3>
            {webhookLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No webhook attempts recorded yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Event Type</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Latency</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {webhookLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 font-mono text-[11px]">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{log.event_type}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-bold ${log.status_code === 200 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {log.status_code || 'Error'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{log.delivery_duration_ms}ms</td>
                        <td className="py-2.5 px-3 text-slate-400">{new Date(log.created_at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: WAITLIST (Optional Extension) */}
      {activeTab === 'waitlist' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Session Waitlists</h2>
            <p className="text-xs text-slate-500">Guests waiting for cancellations. System automatically promotes the next person in line.</p>
          </div>

          {waitlists.length === 0 ? (
            <div className="p-10 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl">
              <UserCheck className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">No active waitlist entries</div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <th className="py-3 px-4">Guest</th>
                    <th className="py-3 px-4">Session Target</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Requested At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {waitlists.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {w.guest_name}
                        <div className="text-[11px] text-slate-500 font-normal">{w.guest_email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">{w.event_name}</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          w.status === 'offered' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono">
                        {new Date(w.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: PROFILE */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 max-w-xl">
          <div>
            <h2 className="text-base font-bold text-slate-900">Profile & Timezone</h2>
            <p className="text-xs text-slate-500">Operating timezone used to compute availability and business hours.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Host Timezone
            </label>
            <select
              value={host.timezone}
              onChange={(e) => handleUpdateProfile(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Embed Modal Dialog (Optional Extension: Embeddable Widget) */}
      {embedModalSlug && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Embed Booking Widget</h3>
              </div>
              <button
                onClick={() => setEmbedModalSlug(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Copy and paste this snippet into your website or React app to embed the booking interface directly:
            </p>

            <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto mb-4 border border-slate-800">
              {`<iframe src="${window.location.origin}/embed/${host.slug}/${embedModalSlug}" width="100%" height="700" frameborder="0"></iframe>`}
            </div>

            <button
              onClick={() => {
                const code = `<iframe src="${window.location.origin}/embed/${host.slug}/${embedModalSlug}" width="100%" height="700" frameborder="0"></iframe>`;
                navigator.clipboard.writeText(code);
                setCopiedEmbed(true);
                setTimeout(() => setCopiedEmbed(false), 2000);
              }}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              {copiedEmbed ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedEmbed ? 'Copied to Clipboard!' : 'Copy Embed Code'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Event Type Creation Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900 text-base">Create Event Type</h3>
              <button onClick={() => setShowEventModal(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Event Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Technical Interview"
                  value={newEvent.name}
                  onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Slug</label>
                  <input
                    type="text"
                    required
                    value={newEvent.slug}
                    onChange={(e) => setNewEvent({ ...newEvent, slug: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="480"
                    value={newEvent.duration_min}
                    onChange={(e) => setNewEvent({ ...newEvent, duration_min: parseInt(e.target.value, 10) || 30 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={newEvent.capacity}
                    onChange={(e) => setNewEvent({ ...newEvent, capacity: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Buffer After (min)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    max="120"
                    value={newEvent.buffer_after_min}
                    onChange={(e) => setNewEvent({ ...newEvent, buffer_after_min: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
