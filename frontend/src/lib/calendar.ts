export function downloadIcsFile(event: {
  title: string;
  startIso: string;
  endIso: string;
  description: string;
  guestName: string;
}) {
  const formatDate = (iso: string) =>
    new Date(iso).toISOString().replace(/-|:|\.\d\d\d/g, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slotbook Enterprise Scheduler//v1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@slotbook.io`,
    `DTSTAMP:${formatDate(new Date().toISOString())}`,
    `DTSTART:${formatDate(event.startIso)}`,
    `DTEND:${formatDate(event.endIso)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    'LOCATION:Virtual Meeting Room',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(event: {
  title: string;
  startIso: string;
  endIso: string;
  details: string;
}) {
  const format = (iso: string) =>
    new Date(iso).toISOString().replace(/-|:|\.\d\d\d/g, '');
  const dates = `${format(event.startIso)}/${format(event.endIso)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    event.title
  )}&dates=${dates}&details=${encodeURIComponent(
    event.details
  )}&location=${encodeURIComponent('Virtual Meeting Room')}`;
}
