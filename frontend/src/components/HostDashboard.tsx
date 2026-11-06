import { useState, useEffect } from 'react';
import { 
  Calendar, Clock, Settings, LogOut, CheckCircle, 
  AlertCircle, RefreshCw, Sliders, CalendarDays, Radio, UserCheck 
} from 'lucide-react';
import HostSignIn from './dashboard/HostSignIn.js';
import OverviewKpis from './dashboard/OverviewKpis.js';
import BookingsTab from './dashboard/BookingsTab.js';
import EventTypesTab from './dashboard/EventTypesTab.js';
import AvailabilityTab from './dashboard/AvailabilityTab.js';
import ExternalCalendarsTab from './dashboard/ExternalCalendarsTab.js';
import WebhooksTab from './dashboard/WebhooksTab.js';
import WaitlistTab from './dashboard/WaitlistTab.js';
import ProfileTab from './dashboard/ProfileTab.js';
import CreateEventModal from './dashboard/CreateEventModal.js';
import EmbedModal from './dashboard/EmbedModal.js';

export default function HostDashboard() {
  const [host, setHost] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'bookings' | 'events' | 'availability' | 'calendars' | 'webhooks' | 'waitlist' | 'profile'
  >('bookings');

  const [bookings, setBookings] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<any[]>([]);
  const [availability, setAvailability] = useState<{ weekly: any[]; overrides: any[] }>({ weekly: [], overrides: [] });
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [busyTimes, setBusyTimes] = useState<any[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [waitlists, setWaitlists] = useState<any[]>([]);

  const [showEventModal, setShowEventModal] = useState(false);
  const [embedModalSlug, setEmbedModalSlug] = useState<string | null>(null);

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
    } catch {
      setActionError('Failed to refresh dashboard records.');
    }
  };

  useEffect(() => {
    if (host) {
      loadDashboardData();
    }
  }, [host]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setHost(null);
  };

  const handleCreateBusyTime = async (title: string, start: string, end: string) => {
    setActionError(null);
    try {
      const res = await fetch('/api/host/busy-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          start_at: new Date(start).toISOString(),
          end_at: new Date(end).toISOString(),
        }),
      });

      if (!res.ok) throw new Error('Failed to create busy time');
      setActionSuccess('External busy block registered successfully.');
      setTimeout(() => setActionSuccess(null), 3000);
      await loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleDeleteBusyTime = async (id: string) => {
    try {
      const res = await fetch(`/api/host/busy-times/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setActionSuccess('Busy block removed.');
      setTimeout(() => setActionSuccess(null), 3000);
      await loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleImportIcs = async (icsData: string) => {
    setActionError(null);
    try {
      const res = await fetch('/api/host/busy-times/import-ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsData }),
      });

      if (!res.ok) throw new Error('Invalid .ics format or failed import');
      const data = await res.json();
      setActionSuccess(`Successfully imported ${data.importedCount} busy blocks from calendar feed.`);
      setTimeout(() => setActionSuccess(null), 4000);
      await loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleRegisterWebhook = async (url: string) => {
    setActionError(null);
    try {
      const res = await fetch('/api/host/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) throw new Error('Failed to register webhook endpoint');
      setActionSuccess('Webhook endpoint and HMAC secret generated.');
      setTimeout(() => setActionSuccess(null), 3000);
      await loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleUpdateTimezone = async (newTz: string) => {
    setActionError(null);
    try {
      const res = await fetch('/api/host/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTz }),
      });

      if (!res.ok) throw new Error('Failed to update timezone');
      setHost({ ...host, timezone: newTz });
      setActionSuccess(`Timezone updated to ${newTz}.`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleCreateEvent = async (eventData: any) => {
    setActionError(null);
    try {
      const res = await fetch('/api/host/event-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create event type');
      }

      setShowEventModal(false);
      setActionSuccess(`Event type "${eventData.name}" created successfully.`);
      setTimeout(() => setActionSuccess(null), 3000);
      await loadDashboardData();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-700" />
        <span>Authenticating host session...</span>
      </div>
    );
  }

  if (!host) {
    return <HostSignIn onLoginSuccess={(hostData) => setHost(hostData)} />;
  }

  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Host Header */}
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

      {/* KPI Metrics */}
      <OverviewKpis
        totalBookings={bookings.length}
        confirmedCount={confirmedCount}
        eventTypesCount={eventTypes.length}
      />

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

      {activeTab === 'bookings' && (
        <BookingsTab bookings={bookings} hostTimezone={host.timezone} />
      )}

      {activeTab === 'events' && (
        <EventTypesTab
          eventTypes={eventTypes}
          hostSlug={host.slug}
          onOpenCreateModal={() => setShowEventModal(true)}
          onOpenEmbedModal={(slug) => setEmbedModalSlug(slug)}
        />
      )}

      {activeTab === 'availability' && (
        <AvailabilityTab availability={availability} hostTimezone={host.timezone} />
      )}

      {activeTab === 'calendars' && (
        <ExternalCalendarsTab
          busyTimes={busyTimes}
          hostTimezone={host.timezone}
          onCreateBusyTime={handleCreateBusyTime}
          onDeleteBusyTime={handleDeleteBusyTime}
          onImportIcs={handleImportIcs}
        />
      )}

      {activeTab === 'webhooks' && (
        <WebhooksTab
          webhooks={webhooks}
          webhookLogs={webhookLogs}
          onRegisterWebhook={handleRegisterWebhook}
        />
      )}

      {activeTab === 'waitlist' && <WaitlistTab waitlists={waitlists} />}

      {activeTab === 'profile' && (
        <ProfileTab timezone={host.timezone} onUpdateTimezone={handleUpdateTimezone} />
      )}

      {embedModalSlug && (
        <EmbedModal
          hostSlug={host.slug}
          eventSlug={embedModalSlug}
          onClose={() => setEmbedModalSlug(null)}
        />
      )}

      {showEventModal && (
        <CreateEventModal
          onClose={() => setShowEventModal(false)}
          onCreate={handleCreateEvent}
        />
      )}
    </div>
  );
}
