import { useState } from 'react';
import { Trash2 } from 'lucide-react';

interface ExternalCalendarsTabProps {
  busyTimes: any[];
  hostTimezone: string;
  onCreateBusyTime: (title: string, start: string, end: string) => Promise<void>;
  onDeleteBusyTime: (id: string) => Promise<void>;
  onImportIcs: (icsText: string) => Promise<void>;
}

export default function ExternalCalendarsTab({
  busyTimes,
  hostTimezone,
  onCreateBusyTime,
  onDeleteBusyTime,
  onImportIcs,
}: ExternalCalendarsTabProps) {
  const [newBusyTitle, setNewBusyTitle] = useState('External Focus');
  const [newBusyStart, setNewBusyStart] = useState('');
  const [newBusyEnd, setNewBusyEnd] = useState('');
  const [icsText, setIcsText] = useState('');

  const handleCreateBusy = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateBusyTime(newBusyTitle, newBusyStart, newBusyEnd);
    setNewBusyStart('');
    setNewBusyEnd('');
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    await onImportIcs(icsText);
    setIcsText('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">
          External Busy Blocks & Calendar Import
        </h2>
        <p className="text-xs text-slate-500">
          Blocks imported here automatically remove overlapping slots to prevent conflicts with your personal calendar.
        </p>
      </div>

      <form
        onSubmit={handleCreateBusy}
        className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4"
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Add Manual Busy Window
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Block Title
            </label>
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
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Start Time (Local or ISO)
            </label>
            <input
              type="datetime-local"
              required
              value={newBusyStart}
              onChange={(e) => setNewBusyStart(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              End Time
            </label>
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

      <form
        onSubmit={handleImport}
        className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3"
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Import .ics File or Calendar Feed
        </h3>
        <p className="text-xs text-slate-500">
          Paste your exported Apple Calendar or Google Calendar .ics content:
        </p>
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

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
          Active Busy Blocks ({busyTimes.length})
        </h3>
        {busyTimes.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No external busy blocks recorded.</p>
        ) : (
          <div className="space-y-2">
            {busyTimes.map((bt) => (
              <div
                key={bt.id}
                className="p-3 border border-slate-200 rounded-xl flex items-center justify-between text-xs bg-white"
              >
                <div>
                  <span className="font-bold text-slate-800">{bt.title}</span>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {new Date(bt.start_at).toLocaleString([], { timeZone: hostTimezone })} to{' '}
                    {new Date(bt.end_at).toLocaleString([], { timeZone: hostTimezone })}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteBusyTime(bt.id)}
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
  );
}

