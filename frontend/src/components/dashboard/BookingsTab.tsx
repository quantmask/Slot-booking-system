import { useState } from 'react';
import { Calendar } from 'lucide-react';

interface BookingsTabProps {
  bookings: any[];
  hostTimezone: string;
}

export default function BookingsTab({ bookings, hostTimezone }: BookingsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');

  const filteredBookings = bookings.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (b.guest_name && b.guest_name.toLowerCase().includes(q)) ||
      (b.guest_email && b.guest_email.toLowerCase().includes(q)) ||
      (b.event_name && b.event_name.toLowerCase().includes(q));

    const matchesStatus =
      statusFilter === 'all' ? true : b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
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
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'all'
                  ? 'bg-white font-bold text-slate-900 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('confirmed')}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'confirmed'
                  ? 'bg-white font-bold text-emerald-600 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Confirmed
            </button>
            <button
              onClick={() => setStatusFilter('cancelled')}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === 'cancelled'
                  ? 'bg-white font-bold text-rose-600 shadow-2xs'
                  : 'text-slate-600'
              }`}
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
                <th className="py-3 px-4">Scheduled Time ({hostTimezone})</th>
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
                      timeZone: hostTimezone,
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
  );
}

