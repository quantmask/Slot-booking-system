import { EventEmitter } from 'events';

export const slotEventEmitter = new EventEmitter();
// Increase listener limit for concurrent client SSE connections
slotEventEmitter.setMaxListeners(200);

export function notifySlotsChanged(hostSlug?: string, eventSlug?: string) {
  slotEventEmitter.emit('slots_changed', {
    hostSlug,
    eventSlug,
    timestamp: Date.now(),
  });
}

