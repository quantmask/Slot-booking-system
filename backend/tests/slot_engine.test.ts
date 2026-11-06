import { describe, it, expect } from 'vitest';
import { generateSlots, EventTypeConfig, WeeklyWindow, DateOverride } from '../lib/slot_engine.js';

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
    { weekday: 1, start_time: '09:00', end_time: '17:00' },
    { weekday: 2, start_time: '09:00', end_time: '17:00' },
    { weekday: 3, start_time: '09:00', end_time: '17:00' },
    { weekday: 4, start_time: '09:00', end_time: '17:00' },
    { weekday: 5, start_time: '09:00', end_time: '17:00' },
    { weekday: 6, start_time: '09:00', end_time: '12:00' },
  ];

  it('generates slots stepped by duration within weekly availability', () => {
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

    expect(slots.length).toBe(2);
    expect(slots[0].display_start).toBe('14:00');
    expect(slots[1].display_start).toBe('14:30');
  });

  it('enforces min_notice_hours strictly', () => {
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

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const slotStart = new Date(slot.start_at).getTime();
      const minAllowed = new Date('2026-11-11T14:00:00.000Z').getTime();
      expect(slotStart).toBeGreaterThanOrEqual(minAllowed);
    }
  });

  describe('DST and Timezone Shifts (PRD Section 8 & Worked Example)', () => {
    it('verifies the PRD worked example: NY host with 09:00 slot before and after Spring-Forward', () => {
      const now = '2026-03-01T00:00:00.000Z';

      const nyWeekly: WeeklyWindow[] = [
        { weekday: 1, start_time: '09:00', end_time: '10:00' },
        { weekday: 6, start_time: '09:00', end_time: '10:00' },
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

      expect(slots.length).toBe(2);

      const satSlot = slots.find(s => s.start_at.startsWith('2026-03-07'));
      const monSlot = slots.find(s => s.start_at.startsWith('2026-03-09'));

      expect(satSlot).toBeDefined();
      expect(monSlot).toBeDefined();

      // Sat Mar 7 (EST, UTC-5): 09:00 EST = 14:00 UTC = 19:30 IST
      expect(satSlot!.start_at).toBe('2026-03-07T14:00:00.000Z');
      expect(satSlot!.display_start).toBe('19:30');

      // Mon Mar 9 (EDT, UTC-4): 09:00 EDT = 13:00 UTC = 18:30 IST
      expect(monSlot!.start_at).toBe('2026-03-09T13:00:00.000Z');
      expect(monSlot!.display_start).toBe('18:30');
    });

    it('T4: skips nonexistent local times during Spring-Forward transition', () => {
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
          active_bookings_count: 2,
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
          active_bookings_count: 1,
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

      expect(slots.find(s => s.display_start === '10:00')).toBeUndefined();
      expect(slots.find(s => s.display_start === '10:30')).toBeUndefined();
    });
  });
});

