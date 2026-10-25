const wholeRupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const rupeesAndPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

/** 6000 → "₹60", 6050 → "₹60.50" */
export function formatPrice(paise: number): string {
  return paise % 100 === 0 ? wholeRupees.format(paise / 100) : rupeesAndPaise.format(paise / 100);
}

export function formatPickupNumber(n: number | null | undefined): string {
  return n == null ? '—' : String(n).padStart(3, '0');
}

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
export const formatShortDay = (isoDate: string) => shortDay.format(new Date(`${isoDate}T00:00:00`));

/** "08:00:00" → "8:00 AM" */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return timeOnly.format(d);
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Local calendar date as YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
