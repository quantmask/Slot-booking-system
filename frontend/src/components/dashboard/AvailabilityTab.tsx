const WEEKDAYS = [
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
  { id: 7, name: 'Sunday' },
];

interface AvailabilityTabProps {
  availability: { weekly: any[]; overrides: any[] };
  hostTimezone: string;
}

export default function AvailabilityTab({
  availability,
  hostTimezone,
}: AvailabilityTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">Weekly Operating Schedule</h2>
        <p className="text-xs text-slate-500">
          Recurring weekly availability windows configured in {hostTimezone}.
        </p>
      </div>

      <div className="space-y-2.5">
        {WEEKDAYS.map((w) => {
          const activeWin = availability.weekly.find((x) => x.weekday === w.id);
          return (
            <div
              key={w.id}
              className="p-3.5 border border-slate-200 rounded-2xl flex items-center justify-between bg-slate-50/50"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="font-semibold text-sm text-slate-800 w-28">{w.name}</span>
                <span className="text-xs font-mono text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                  {activeWin
                    ? `${activeWin.start_time.slice(0, 5)} to ${activeWin.end_time.slice(0, 5)}`
                    : '09:00 to 17:00'}
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
  );
}

