import { describe, it, expect } from 'vitest';
import { generateSlots, EventTypeConfig, WeeklyWindow, DateOverride } from '../src/core/slot_engine.js';
import { DateTime } from 'luxon';

describe('Slot Generation Engine', () => {
  const baseEventType: EventTypeConfig = {
    id: 'evt-1',
    slug: 'quick-catchup',
    name: 'Quick Catchup',
    duration_min: 30,
    capacity: 1,
    buffer_before_min: 0,
    buffer_after_min: 15,
    min_notice_hours: 4,
    horizon_days: 30,
  };

  const standardWeekly: WeeklyWindow[] = [
    { weekday: 1, start_time: '09:00', end_time: '17:00' }, // Mon
    { weekday: 2, start_time: '09:00', end_time: '17:00' }, // Tue
    { weekday: 3, start_time: '09:00', end_time: '17:00' }, // Wed
    { weekday: 4, start_time: '09:00', end_time: '17:00' }, // Thu
    { weekday: 5, start_time: '09:00', end_time: '17:00' }, // Fri
    { weekday: 6, start_time: '09:00', end_time: '12:00' }, // Sat
  ];

  it('generates slots stepped by duration within weekly availability', () => {
    // Wednesday 2026-11-11 at 00:00 UTC
    const now = '2026-11-11T00:00:00.000Z';
    const slots = generateSlots({
      hostTimezone: 'UTC',
      guestTimezone: 'UTC',
      eventType: baseEventType,
      weeklyAvailability: standardWeekly,
      dateOverrides: [],
      existingSessions: [],
      fromUtc: '2026-11-11T09:00:00.000Z',
      toUtc: '2026-11-11T12:00:00.000Z',
      now,
    });

    // 09:00-12:00 in 30 min steps: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30 (6 slots)
    expect(slots.length).toBe(6);
    expect(slots[0].display_start).toBe('09:00');
    expect(slots[0].display_end).toBe('09:30');
    expect(slots[5].display_start).toBe('11:30');
    expect(slots[5].display_end).toBe('12:00');
  });

  it('respects date override for a full day off', () => {
    const now = '2026-11-11T00:00:00.000Z';
    const overrides: DateOverride[] = [
      { date: '2026-11-11', is_off: true },
    ];

    const slots = generateSlots({
      hostTimezone: 'UTC',
      guestTimezone: 'UTC',
      eventType: baseEventType,
      weeklyAvailability: standardWeekly,
      dateOverrides: overrides,
      existingSessions: [],
      fromUtc: '2026-11-11T00:00:00.000Z',
      toUtc: '2026-11-11T23:59:59.000Z',
      now,
    });

    expect(slots.length).toBe(0);
  });

  it('respects date override for custom hours', () => {
    const now = '2026-11-11T00:00:00.000Z';
    const overrides: DateOverride[] = [
      { date: '2026-11-11', is_off: false, start_time: '14:00', end_time: '15:00' },
    ];

    const slots = generateSlots({
      hostTimezone: 'UTC',
      guestTimezone: 'UTC',
      eventType: baseEventType,
      weeklyAvailability: standardWeekly,
      dateOverrides: overrides,
      existingSessions: [],
      fromUtc: '2026-11-11T00:00:00.000Z',
      toUtc: '2026-11-11T23:59:59.000Z',
      now,
    });

    // Only 14:00-14:30 and 14:30-15:00 (2 slots)
    expect(slots.length).toBe(2);
    expect(slots[0].display_start).toBe('14:00');
    expect(slots[1].display_start).toBe('14:30');
  });

  it('enforces min_notice_hours strictly', () => {
    // Now is 10:00 UTC, min notice is 4 hours -> first valid slot >= 14:00 UTC
    const now = '2026-11-11T10:00:00.000Z';

    const slots = generateSlots({
      hostTimezone: 'UTC',
      guestTimezone: 'UTC',
      eventType: baseEventType,
      weeklyAvailability: standardWeekly,
      dateOverrides: [],
      existingSessions: [],
      fromUtc: '2026-11-11T10:00:00.000Z',
      toUtc: '2026-11-11T16:00:00.000Z',
      now,
    });

    // Slots before 14:00 must be excluded
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const slotStart = new Date(slot.start_at).getTime();
      const minAllowed = new Date('2026-11-11T14:00:00.000Z').getTime();
      expect(slotStart).toBeGreaterThanOrEqual(minAllowed);
    }
  });

  describe('DST and Timezone Shifts (PRD Section 8 & Worked Example)', () => {
    it('verifies the PRD worked example: NY host with 09:00 slot before and after Spring-Forward', () => {
      // Worked example from PRD Section 8:
      // Host: America/New_York
      // Saturday March 7, 2026 (EST, UTC-5): 09:00 EST -> 14:00Z -> shown as 19:30 to Asia/Kolkata
      // Monday March 9, 2026 (EDT, UTC-4): 09:00 EDT -> 13:00Z -> shown as 18:30 to Asia/Kolkata
      const now = '2026-03-01T00:00:00.000Z';

      const nyWeekly: WeeklyWindow[] = [
        { weekday: 1, start_time: '09:00', end_time: '10:00' }, // Mon 09:00-10:00
        { weekday: 6, start_time: '09:00', end_time: '10:00' }, // Sat 09:00-10:00
      ];

      const slots = generateSlots({
        hostTimezone: 'America/New_York',
        guestTimezone: 'Asia/Kolkata',
        eventType: { ...baseEventType, duration_min: 60, min_notice_hours: 0 },
        weeklyAvailability: nyWeekly,
        dateOverrides: [],
        existingSessions: [],
        fromUtc: '2026-03-07T00:00:00.000Z',
        toUtc: '2026-03-10T00:00:00.000Z',
        now,
      });

      // We should have 2 slots: Sat Mar 7 09:00 NY, Mon Mar 9 09:00 NY
      expect(slots.length).toBe(2);

      const satSlot = slots.find(s => s.start_at.startsWith('2026-03-07'));
      const monSlot = slots.find(s => s.start_at.startsWith('2026-03-09'));

      expect(satSlot).toBeDefined();
      expect(monSlot).toBeDefined();

      // Sat Mar 7 in NY is EST (UTC-5): 09:00 EST = 14:00 UTC
      expect(satSlot!.start_at).toBe('2026-03-07T14:00:00.000Z');
      // In Asia/Kolkata (UTC+5:30), 14:00 UTC is 19:30 IST
      expect(satSlot!.display_start).toBe('19:30');

      // Mon Mar 9 in NY is EDT (UTC-4): 09:00 EDT = 13:00 UTC
      expect(monSlot!.start_at).toBe('2026-03-09T13:00:00.000Z');
      // In Asia/Kolkata (UTC+5:30), 13:00 UTC is 18:30 IST
      expect(monSlot!.display_start).toBe('18:30');
    });

    it('T4: skips nonexistent local times during Spring-Forward transition', () => {
      // In America/New_York on Sunday March 8, 2026:
      // Clocks jump from 02:00 to 03:00. Local times between 02:00 and 02:59 do not exist.
      const sunWindow: WeeklyWindow[] = [
        { weekday: 7, start_time: '01:30', end_time: '03:30' },
      ];

      const slots = generateSlots({
        hostTimezone: 'America/New_York',
        guestTimezone: 'America/New_York',
        eventType: { ...baseEventType, duration_min: 30, min_notice_hours: 0 },
        weeklyAvailability: sunWindow,
        dateOverrides: [],
        existingSessions: [],
        fromUtc: '2026-03-08T00:00:00.000Z',
        toUtc: '2026-03-08T23:59:59.000Z',
        now: '2026-03-01T00:00:00.000Z',
      });

      // Candidate steps:
      // 01:30 -> valid (EST)
      // 02:00 -> invalid (skipped by DST)
      // 02:30 -> invalid (skipped by DST)
      // 03:00 -> valid (EDT)
      const displayStarts = slots.map(s => s.display_start);
      expect(displayStarts).toContain('01:30');
      expect(displayStarts).toContain('03:00');
      expect(displayStarts).not.toContain('02:00');
      expect(displayStarts).not.toContain('02:30');
    });
  });

  describe('Capacity and Overlap Filtering', () => {
    it('reduces remaining seats for group sessions with existing active bookings', () => {
      const now = '2026-11-11T00:00:00.000Z';
      const groupEvent: EventTypeConfig = {
        ...baseEventType,
        capacity: 3,
        duration_min: 60,
      };

      const existingSessions = [
        {
          id: 'sess-1',
          event_type_id: groupEvent.id,
          start_at: '2026-11-11T10:00:00.000Z',
          end_at: '2026-11-11T11:00:00.000Z',
          blocked_start: '2026-11-11T10:00:00.000Z',
          blocked_end: '2026-11-11T11:15:00.000Z',
          capacity: 3,
          active_bookings_count: 2, // 2 taken, 1 left
        },
      ];

      const slots = generateSlots({
        hostTimezone: 'UTC',
        guestTimezone: 'UTC',
        eventType: groupEvent,
        weeklyAvailability: standardWeekly,
        dateOverrides: [],
        existingSessions,
        fromUtc: '2026-11-11T10:00:00.000Z',
        toUtc: '2026-11-11T11:00:00.000Z',
        now,
      });

      expect(slots.length).toBe(1);
      expect(slots[0].capacity).toBe(3);
      expect(slots[0].seats_left).toBe(1);
    });

    it('filters out slot completely when full', () => {
      const now = '2026-11-11T00:00:00.000Z';
      const existingSessions = [
        {
          id: 'sess-1',
          event_type_id: baseEventType.id,
          start_at: '2026-11-11T10:00:00.000Z',
          end_at: '2026-11-11T10:30:00.000Z',
          blocked_start: '2026-11-11T10:00:00.000Z',
          blocked_end: '2026-11-11T10:45:00.000Z',
          capacity: 1,
          active_bookings_count: 1, // Full
        },
      ];

      const slots = generateSlots({
        hostTimezone: 'UTC',
        guestTimezone: 'UTC',
        eventType: baseEventType,
        weeklyAvailability: standardWeekly,
        dateOverrides: [],
        existingSessions,
        fromUtc: '2026-11-11T10:00:00.000Z',
        toUtc: '2026-11-11T11:00:00.000Z',
        now,
      });

      // 10:00 is taken, and buffer (to 10:45) blocks 10:30!
      expect(slots.find(s => s.display_start === '10:00')).toBeUndefined();
      expect(slots.find(s => s.display_start === '10:30')).toBeUndefined();
    });
  });
});
