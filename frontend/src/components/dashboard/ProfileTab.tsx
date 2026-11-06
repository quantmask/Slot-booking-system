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

interface ProfileTabProps {
  timezone: string;
  onUpdateTimezone: (tz: string) => Promise<void>;
}

export default function ProfileTab({ timezone, onUpdateTimezone }: ProfileTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-5 max-w-xl">
      <div>
        <h2 className="text-base font-bold text-slate-900">Profile & Timezone</h2>
        <p className="text-xs text-slate-500">
          Operating timezone used to compute availability and business hours.
        </p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Host Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => onUpdateTimezone(e.target.value)}
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
  );
}

