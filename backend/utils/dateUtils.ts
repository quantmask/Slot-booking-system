import { DateTime } from 'luxon';

export function formatUtcToZone(utcIso: string, zone: string, format = 'yyyy-MM-dd HH:mm'): string {
  return DateTime.fromISO(utcIso, { zone: 'utc' }).setZone(zone).toFormat(format);
}

export function getCurrentDbTime(dbNowDate: Date): DateTime {
  return DateTime.fromJSDate(dbNowDate, { zone: 'utc' });
}

