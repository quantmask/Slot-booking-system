import { Calendar, ArrowRight, UserPlus } from 'lucide-react';

interface Slot {
  start_at: string;
  end_at: string;
  display_start: string;
  display_end: string;
  guest_date: string;
  capacity: number;
  seats_left: number;
}

interface SlotGridProps {
  selectedDate: string;
  selectedDaySlots: Slot[];
  durationMin: number;
  nextAvailableDate?: string;
  onSelectSlot: (slot: Slot) => void;
  onJumpDate: (dateStr: string) => void;
  onOpenWaitlist: (slotTime: string) => void;
  formatIsoDate: (isoDate: string, options: Intl.DateTimeFormatOptions) => string;
}

export default function SlotGrid({
  selectedDate,
  selectedDaySlots,
  durationMin,
  nextAvailableDate,
  onSelectSlot,
  onJumpDate,
  onOpenWaitlist,
  formatIsoDate,
}: SlotGridProps) {
  return (
    <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50/40">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200/80">
        <div>
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-0.5">
            Viewing Appointments For
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900">
            {formatIsoDate(selectedDate, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </h3>
        </div>
        <div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              selectedDaySlots.length > 0
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {selectedDaySlots.length} available slot{selectedDaySlots.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {selectedDaySlots.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {selectedDaySlots.map((slot) => {
            const isGroup = slot.capacity > 1;
            return (
              <button
                key={slot.start_at}
                onClick={() => onSelectSlot(slot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSlot(slot);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Reserve slot at ${slot.display_start}`}
                className="p-3.5 border border-slate-200/90 rounded-xl bg-white hover:border-indigo-600 hover:bg-indigo-50/50 hover:shadow-2xs text-center transition group relative focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <div className="text-base font-bold text-slate-900 group-hover:text-indigo-600 tracking-tight transition">
                  {slot.display_start}
                </div>
                {isGroup ? (
                  <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>{slot.seats_left} seat{slot.seats_left === 1 ? '' : 's'} left</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 group-hover:text-indigo-500 mt-0.5 transition">
                    {durationMin} min • 1-on-1
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-12 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-base">No Appointments Available</h4>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
            There are no open slots on this date. Choose another date from the calendar above, or jump directly to the next open opening.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {nextAvailableDate && (
              <button
                type="button"
                onClick={() => onJumpDate(nextAvailableDate)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
              >
                <span>
                  Jump to Next Open Day ({formatIsoDate(nextAvailableDate, { month: 'short', day: 'numeric' })})
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenWaitlist(selectedDate + 'T09:00:00Z')}
              className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Join Waitlist for This Day</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

