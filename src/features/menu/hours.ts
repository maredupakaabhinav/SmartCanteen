import type { CanteenSettings } from '@/types/database';
import { formatClock } from '@/lib/format';

export interface OpenState {
  isOpen: boolean;
  /** Short, factual status line, e.g. "Open now · until 10:00 PM". */
  label: string;
  /** Reason ordering is unavailable, when closed. */
  detail: string | null;
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Wall-clock parts for `now` in the canteen's timezone. */
function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    isoDay: weekdays.indexOf(get('weekday')) + 1,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/** Mirrors public.is_canteen_open() for display. The database remains the authority. */
export function getOpenState(settings: CanteenSettings, now = new Date()): OpenState {
  let zoned: { isoDay: number; time: string };
  try {
    zoned = zonedParts(now, settings.timezone);
  } catch {
    zoned = zonedParts(now, 'Asia/Kolkata');
  }
  const opening = settings.opening_time.slice(0, 8).padEnd(8, ':00');
  const closing = settings.closing_time.slice(0, 8).padEnd(8, ':00');
  const openToday = settings.open_days.includes(zoned.isoDay);

  if (!settings.accepting_orders) {
    return { isOpen: false, label: 'Not taking orders right now', detail: 'The canteen has paused online orders.' };
  }
  if (openToday && zoned.time >= opening && zoned.time < closing) {
    return { isOpen: true, label: `Open now · until ${formatClock(closing)}`, detail: null };
  }

  // Find the next opening.
  const beforeOpening = openToday && zoned.time < opening;
  if (beforeOpening) {
    return { isOpen: false, label: `Closed · opens ${formatClock(opening)}`, detail: `Online ordering opens at ${formatClock(opening)}.` };
  }
  for (let i = 1; i <= 7; i++) {
    const day = ((zoned.isoDay - 1 + i) % 7) + 1;
    if (settings.open_days.includes(day)) {
      const when = i === 1 ? 'tomorrow' : DAY_NAMES[day];
      return {
        isOpen: false,
        label: `Closed · opens ${when} ${formatClock(opening)}`,
        detail: `Online ordering reopens ${when} at ${formatClock(opening)}.`,
      };
    }
  }
  return { isOpen: false, label: 'Closed', detail: 'Online ordering is currently unavailable.' };
}

export function describeOpenDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5,6') return 'Monday – Saturday';
  if (sorted.join() === '1,2,3,4,5') return 'Monday – Friday';
  return sorted.map((d) => DAY_NAMES[d]?.slice(0, 3)).join(', ');
}
