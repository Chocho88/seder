// Task -> calendar handoff, zero-auth (Phase 0 of the calendar vision).
// A deadline is an all-day event: the calendar's week view shows WHAT is
// due, and time-blocking stays a deliberate act - the Google Calendar
// editor the link opens is where a slot gets picked. Pure module,
// browser-free, split-check-tested.

import type { Item } from './types';

type CalItem = Pick<Item, 'id' | 'title' | 'due' | 'notes' | 'updatedAt'>;

const pad = (n: number) => String(n).padStart(2, '0');

/** The LOCAL calendar date of an epoch as an all-day YYYYMMDD. due is
    pinned to 09:00 local (dates.ts), so local parts are the truth. */
const ymd = (epoch: number): string => {
  const d = new Date(epoch);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

/** All-day ranges are end-EXCLUSIVE: a one-day event ends the next day. */
const nextDay = (epoch: number): number => {
  const d = new Date(epoch);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

/** A Google Calendar event-template link for a due-dated task. The user
    lands in GCal's own editor - title and day prefilled, notes and a link
    back to the task in the details - and can drop it on a time slot there. */
export function gcalRenderUrl(item: CalItem, origin: string): string | null {
  if (item.due === null) return null;
  const params = new URLSearchParams();
  params.set('action', 'TEMPLATE');
  params.set('text', item.title);
  params.set('dates', `${ymd(item.due)}/${ymd(nextDay(item.due))}`);
  const details = [item.notes.trim(), origin ? `${origin}/?open=${item.id}` : '']
    .filter(Boolean)
    .join('\n\n');
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// --- ICS (RFC 5545): the same all-day event as a file - Apple Calendar,
// Outlook, anything. Deterministic (DTSTAMP from updatedAt) so tests can
// assert exact output.

const icsEscape = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold a content line at 75 OCTETS (not chars - Hebrew is 2 bytes/char);
    continuation lines begin with a single space. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const limit = 73; // a margin under 75, and the continuation space costs 1
  let out = '';
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out += (out ? '\r\n ' : '') + cur;
      cur = ch;
      bytes = b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  return out ? `${out}\r\n ${cur}` : cur;
}

const utcStamp = (epoch: number): string => {
  const d = new Date(epoch);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

export function icsContent(item: CalItem): string | null {
  if (item.due === null) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//seder//task//EN',
    'BEGIN:VEVENT',
    `UID:${item.id}@seder`,
    `DTSTAMP:${utcStamp(item.updatedAt)}`,
    `DTSTART;VALUE=DATE:${ymd(item.due)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(item.due))}`,
    `SUMMARY:${icsEscape(item.title)}`,
    ...(item.notes.trim() ? [`DESCRIPTION:${icsEscape(item.notes.trim())}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
