/** Local calendar dates as 'yyyy-MM-dd' strings (matches the backend DateOnly). */

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseIsoDate(s).getTime());
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Monday of the ISO week containing the date. */
export function startOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  const offset = (d.getDay() + 6) % 7;
  return addDays(iso, -offset);
}

export function isoWeekNumber(iso: string): number {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

const dayFormat = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', day: 'numeric', month: 'short' });
const shortFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

export function formatDay(iso: string): string {
  const today = todayIso();
  if (iso === today) return 'I dag';
  if (iso === addDays(today, -1)) return 'I går';
  if (iso === addDays(today, 1)) return 'I morgen';
  return dayFormat.format(parseIsoDate(iso));
}

export function formatShort(iso: string): string {
  return shortFormat.format(parseIsoDate(iso));
}
