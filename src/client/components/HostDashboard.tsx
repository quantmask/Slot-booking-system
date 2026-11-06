import React, { useState, useEffect } from 'react';
import { User, Calendar, Clock, Settings, LogOut, Plus, Trash2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

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

  // Login form state
  const [email, setEmail] = useState('alex@example.com');
  const [password, setPassword] = useState('password123');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [submittingLogin, setSubmittingLogin] = useState(false);

  // Data states
  const [bookings, setBookings] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<{ weekly: any[]; overrides: any[] }>({ weekly: [], overrides: [] });
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      loadDashboardData();
      setActionSuccess('Event type created');
      setTimeout(() => setActionSuccess(null), 2500);
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
        body: JSON.stringify({ archived: true }),
      });
      if (res.ok) {
        loadDashboardData();
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleHostCancelBooking = async () => {
    if (!cancelModalBookingId || !hostCancelReason.trim()) return;
    try {
      const res = await fetch(`/api/host/bookings/${cancelModalBookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: hostCancelReason }),
      });

      if (res.ok) {
        setCancelModalBookingId(null);
        setHostCancelReason('');
        loadDashboardData();
        setActionSuccess('Booking cancelled and guest notified via outbox');
        setTimeout(() => setActionSuccess(null), 2500);
      }
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-600" />
        <p>Checking authentication...</p>
      </div>
    );
  }

  // Login View
  if (!host) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-2">
            <User className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Host Login</h1>
          <p className="text-xs text-slate-500 mt-1">Sign in to manage your availability & bookings</p>
        </div>

        {loginError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submittingLogin}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {submittingLogin ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            onClick={() => {
              setEmail('alex@example.com');
              setPassword('password123');
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Quick-fill Seeded Host Credentials (Alex)
          </button>
        </div>
      </div>
    );
  }

  // Authenticated Dashboard
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
            {host.slug.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">@{host.slug}</h1>
            <p className="text-xs text-slate-500">{host.email} • {host.timezone}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadDashboardData}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={handleLogout}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200 text-xs font-medium flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        {(['bookings', 'events', 'availability', 'profile'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize border-b-2 transition ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab: Bookings */}
      {activeTab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Upcoming & Recent Bookings</h2>

          {bookings.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No bookings recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5">Guest</th>
                    <th className="py-2.5">Event</th>
                    <th className="py-2.5">Start Time ({host.timezone})</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-medium text-slate-900">
                        {b.guest_name || 'Anonymous Hold'}
                        <div className="text-[11px] text-slate-400 font-normal">{b.guest_email || '—'}</div>
                      </td>
                      <td className="py-3 text-slate-700">{b.event_name}</td>
                      <td className="py-3 text-slate-700 font-mono">
                        {new Date(b.start_at).toLocaleString([], {
                          timeZone: host.timezone,
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            b.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.status === 'held'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {b.status === 'confirmed' && (
                          <button
                            onClick={() => setCancelModalBookingId(b.id)}
                            className="text-red-600 hover:text-red-800 font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Event Types */}
      {activeTab === 'events' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-bold text-slate-900">Active Event Types</h2>
            <button
              onClick={() => setShowEventModal(true)}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> New Event Type
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {eventTypes.map((et) => (
              <div key={et.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900">{et.name}</h3>
                    <p className="text-xs font-mono text-slate-500">/{host.slug}/{et.slug}</p>
                  </div>
                  <button
                    onClick={() => handleArchiveEvent(et.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    title="Archive event type"
                  >
                    Archive
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400 block">Duration</span>
                    <span className="font-semibold">{et.duration_min}m</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Capacity</span>
                    <span className="font-semibold">{et.capacity}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Notice / Horizon</span>
                    <span className="font-semibold">{et.min_notice_hours}h / {et.horizon_days}d</span>
                  </div>
                </div>

                <div className="mt-3">
                  <a
                    href={`/${host.slug}/${et.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Open Public Booking Page →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Profile */}
      {activeTab === 'profile' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg">
          <h2 className="text-base font-bold text-slate-900 mb-4">Host Profile & Timezone</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Host Home Timezone</label>
              <select
                value={host.timezone}
                onChange={(e) => handleUpdateProfile(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                All host availability windows and calendar slots are scheduled relative to this timezone.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Host Cancel Modal */}
      {cancelModalBookingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-lg">
            <h3 className="font-bold text-base text-slate-900 mb-2">Cancel Booking as Host</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter a cancellation reason. The guest will receive an outbox event notification.
            </p>
            <textarea
              required
              rows={3}
              value={hostCancelReason}
              onChange={(e) => setHostCancelReason(e.target.value)}
              placeholder="e.g. Host emergency / scheduling conflict"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-red-500 focus:outline-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setCancelModalBookingId(null)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium"
              >
                Back
              </button>
              <button
                onClick={handleHostCancelBooking}
                disabled={!hostCancelReason.trim()}
                className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition disabled:opacity-50"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-lg">
            <h3 className="font-bold text-base text-slate-900 mb-4">Create New Event Type</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={newEvent.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    setNewEvent({ ...newEvent, name, slug });
                  }}
                  className="w-full p-2 border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Slug</label>
                <input
                  type="text"
                  required
                  value={newEvent.slug}
                  onChange={(e) => setNewEvent({ ...newEvent, slug: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    min={15}
                    max={120}
                    value={newEvent.duration_min}
                    onChange={(e) => setNewEvent({ ...newEvent, duration_min: parseInt(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={newEvent.capacity}
                    onChange={(e) => setNewEvent({ ...newEvent, capacity: parseInt(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700"
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
