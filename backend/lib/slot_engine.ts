import { DateTime, IANAZone } from 'luxon';

export interface EventTypeConfig {
  id: string;
  slug: string;
  name: string;
  duration_min: number;
  capacity: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_hours: number;
  horizon_days: number;
}

export interface WeeklyWindow {
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface DateOverride {
  date: string;
  is_off: boolean;
  start_time?: string | null;
  end_time?: string | null;
}

export interface ExistingSession {
  id: string;
  event_type_id: string;
  start_at: Date | string;
  end_at: Date | string;
  blocked_start: Date | string;
  blocked_end: Date | string;
  capacity: number;
  active_bookings_count: number;
}

export interface ExternalBusyBlock {
  start_at: Date | string;
  end_at: Date | string;
  title?: string;
}

export interface GenerateSlotsParams {
  hostTimezone: string;
  guestTimezone?: string;
  eventType: EventTypeConfig;
  weeklyAvailability: WeeklyWindow[];
  dateOverrides: DateOverride[];
  existingSessions: ExistingSession[];
  externalBusyTimes?: ExternalBusyBlock[];
  fromUtc?: string | Date;
  toUtc?: string | Date;
  now?: string | Date;
}

export interface AvailableSlot {
  start_at: string;
  end_at: string;
  display_start: string;
  display_end: string;
  guest_date: string;
  capacity: number;
  seats_left: number;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  return IANAZone.isValidZone(tz);
}

function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function generateSlots(params: GenerateSlotsParams): AvailableSlot[] {
  const {
    hostTimezone,
    guestTimezone = 'UTC',
    eventType,
    weeklyAvailability,
    dateOverrides,
    existingSessions,
    externalBusyTimes = [],
  } = params;

  if (!isValidTimezone(hostTimezone)) {
    throw new Error(`Invalid host timezone: ${hostTimezone}`);
  }
  if (!isValidTimezone(guestTimezone)) {
    throw new Error(`Invalid guest timezone: ${guestTimezone}`);
  }

  const nowDt = params.now 
    ? (params.now instanceof Date ? DateTime.fromJSDate(params.now) : DateTime.fromISO(params.now)).toUTC()
    : DateTime.utc();

  const minNoticeThreshold = nowDt.plus({ hours: eventType.min_notice_hours });
  const horizonThreshold = nowDt.plus({ days: eventType.horizon_days });

  const queryStart = params.fromUtc 
    ? DateTime.fromISO(typeof params.fromUtc === 'string' ? params.fromUtc : params.fromUtc.toISOString()).toUTC()
    : nowDt;
  const queryEnd = params.toUtc
    ? DateTime.fromISO(typeof params.toUtc === 'string' ? params.toUtc : params.toUtc.toISOString()).toUTC()
    : horizonThreshold;

  const effectiveStart = queryStart > minNoticeThreshold ? queryStart : minNoticeThreshold;
  const effectiveEnd = queryEnd < horizonThreshold ? queryEnd : horizonThreshold;

  if (effectiveStart >= effectiveEnd) {
    return [];
  }

  const parsedSessions = existingSessions.map(s => ({
    id: s.id,
    eventTypeId: s.event_type_id,
    startMs: new Date(s.start_at).getTime(),
    endMs: new Date(s.end_at).getTime(),
    blockedStartMs: new Date(s.blocked_start).getTime(),
    blockedEndMs: new Date(s.blocked_end).getTime(),
    capacity: s.capacity,
    activeBookings: s.active_bookings_count,
  }));

  const overrideMap = new Map<string, DateOverride>();
  for (const o of dateOverrides) {
    const key = typeof o.date === 'string' ? o.date.slice(0, 10) : DateTime.fromJSDate(o.date).toISODate()!;
    overrideMap.set(key, o);
  }

  const weeklyMap = new Map<number, WeeklyWindow[]>();
  for (const w of weeklyAvailability) {
    const list = weeklyMap.get(w.weekday) || [];
    list.push(w);
    weeklyMap.set(w.weekday, list);
  }

  let curHostDate = effectiveStart.setZone(hostTimezone).startOf('day');
  const endHostDate = effectiveEnd.setZone(hostTimezone).endOf('day');

  const slots: AvailableSlot[] = [];

  while (curHostDate <= endHostDate) {
    const dateStr = curHostDate.toISODate()!;
    const weekday = curHostDate.weekday;

    let dayWindows: { start_time: string; end_time: string }[] = [];

    if (overrideMap.has(dateStr)) {
      const override = overrideMap.get(dateStr)!;
      if (!override.is_off && override.start_time && override.end_time) {
        dayWindows = [{ start_time: override.start_time, end_time: override.end_time }];
      }
    } else {
      const regular = weeklyMap.get(weekday) || [];
      dayWindows = regular.map(r => ({ start_time: r.start_time, end_time: r.end_time }));
    }

    for (const win of dayWindows) {
      const winStartMin = parseTimeToMinutes(win.start_time);
      const winEndMin = parseTimeToMinutes(win.end_time);

      for (let minOffset = winStartMin; minOffset + eventType.duration_min <= winEndMin; minOffset += eventType.duration_min) {
        const slotHour = Math.floor(minOffset / 60);
        const slotMinute = minOffset % 60;

        const localSlotStart = DateTime.fromObject(
          {
            year: curHostDate.year,
            month: curHostDate.month,
            day: curHostDate.day,
            hour: slotHour,
            minute: slotMinute,
            second: 0,
            millisecond: 0,
          },
          { zone: hostTimezone }
        );

        // Discard nonexistent local times during DST spring-forward transitions
        if (!localSlotStart.isValid || localSlotStart.hour !== slotHour || localSlotStart.minute !== slotMinute) {
          continue;
        }

        const slotStartUtc = localSlotStart.toUTC();
        const slotEndUtc = slotStartUtc.plus({ minutes: eventType.duration_min });

        const slotStartMs = slotStartUtc.toMillis();
        const slotEndMs = slotEndUtc.toMillis();

        if (slotStartMs < effectiveStart.toMillis() || slotStartMs >= effectiveEnd.toMillis()) {
          continue;
        }

        const candBlockedStartMs = slotStartMs - eventType.buffer_before_min * 60 * 1000;
        const candBlockedEndMs = slotEndMs + eventType.buffer_after_min * 60 * 1000;

        let seatsLeft = eventType.capacity;
        let isBlocked = false;

        for (const session of parsedSessions) {
          if (session.eventTypeId === eventType.id && session.startMs === slotStartMs) {
            seatsLeft = session.capacity - session.activeBookings;
            if (seatsLeft <= 0) {
              isBlocked = true;
              break;
            }
          } else {
            // Half-open interval intersection: [candBlockedStart, candBlockedEnd) with [sessionBlockedStart, sessionBlockedEnd)
            const overlaps = candBlockedStartMs < session.blockedEndMs && candBlockedEndMs > session.blockedStartMs;
            if (overlaps) {
              isBlocked = true;
              break;
            }
          }
        }

        if (!isBlocked && externalBusyTimes.length > 0) {
          for (const busy of externalBusyTimes) {
            const bStart = new Date(busy.start_at).getTime();
            const bEnd = new Date(busy.end_at).getTime();
            if (candBlockedStartMs < bEnd && candBlockedEndMs > bStart) {
              isBlocked = true;
              break;
            }
          }
        }

        if (isBlocked || seatsLeft <= 0) {
          continue;
        }

        const guestStartDt = slotStartUtc.setZone(guestTimezone);
        const guestEndDt = slotEndUtc.setZone(guestTimezone);

        slots.push({
          start_at: slotStartUtc.toISO()!,
          end_at: slotEndUtc.toISO()!,
          display_start: guestStartDt.toFormat('HH:mm'),
          display_end: guestEndDt.toFormat('HH:mm'),
          guest_date: guestStartDt.toISODate()!,
          capacity: eventType.capacity,
          seats_left: seatsLeft,
        });
      }
    }

    curHostDate = curHostDate.plus({ days: 1 });
  }

  return slots.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}
