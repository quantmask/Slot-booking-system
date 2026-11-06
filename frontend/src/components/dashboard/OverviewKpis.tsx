interface OverviewKpisProps {
  totalBookings: number;
  confirmedCount: number;
  eventTypesCount: number;
}

export default function OverviewKpis({
  totalBookings,
  confirmedCount,
  eventTypesCount,
}: OverviewKpisProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Total Bookings
        </span>
        <div className="text-2xl font-bold text-slate-900 mt-1">{totalBookings}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Recorded in calendar</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
          Confirmed
        </span>
        <div className="text-2xl font-bold text-emerald-600 mt-1">{confirmedCount}</div>
        <div className="text-[11px] text-emerald-600/70 mt-0.5">Active upcoming sessions</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Event Types
        </span>
        <div className="text-2xl font-bold text-slate-900 mt-1">{eventTypesCount}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Public booking templates</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
          Weekly Schedule
        </span>
        <div className="text-2xl font-bold text-indigo-600 mt-1">40h</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Mon to Fri, 9am to 5pm</div>
      </div>
    </div>
  );
}
