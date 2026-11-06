import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarDropdownProps {
  calendarMonth: Date;
  selectedDate: string;
  todayDateStr: string;
  slotsByDate: Record<string, any[]>;
  onSelectDate: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToday: () => void;
}

export default function CalendarDropdown({
  calendarMonth,
  selectedDate,
  todayDateStr,
  slotsByDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onJumpToday,
}: CalendarDropdownProps) {
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarMonthLabel = calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();

  return (
    <div className="absolute left-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-76 sm:w-80 animate-in fade-in zoom-in-95">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs sm:text-sm font-bold text-slate-900">{calendarMonthLabel}</span>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="text-[10px] font-bold text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
          <div key={`blank-${idx}`} className="h-8 w-8" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNum = idx + 1;
          const dStr = `${calendarYear}-${String(calendarMonthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const hasSlots = (slotsByDate[dStr]?.length || 0) > 0;
          const isSelected = selectedDate === dStr;
          const isToday = dStr === todayDateStr;
          const isPast = dStr < todayDateStr;

          return (
            <button
              key={dStr}
              type="button"
              disabled={isPast}
              onClick={() => onSelectDate(dStr)}
              className={`h-8 w-8 mx-auto rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all relative ${
                isSelected
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : hasSlots
                  ? 'bg-indigo-50/80 text-indigo-950 font-bold hover:bg-indigo-100 border border-indigo-200/70'
                  : isToday
                  ? 'border border-slate-300 text-slate-900 font-bold hover:bg-slate-50'
                  : isPast
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{dayNum}</span>
              {hasSlots && !isSelected && (
                <span className="w-1 h-1 rounded-full bg-emerald-500 absolute bottom-1"></span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Available Slots</span>
        </div>
        <button
          type="button"
          onClick={onJumpToday}
          className="text-indigo-600 hover:text-indigo-800 font-semibold"
        >
          Jump to Today
        </button>
      </div>
    </div>
  );
}

