import type { Currency } from '@/types';

/**
 * All display formatting, in one place.
 *
 * Built on `Intl`, which Hermes ships, so localisation later is a locale
 * argument rather than a rewrite. Formatter construction is genuinely
 * expensive, so instances are cached — this runs inside list rows.
 */

const DEFAULT_LOCALE = 'en-US';

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

const numberFormat = (key: string, build: () => Intl.NumberFormat): Intl.NumberFormat => {
  const existing = cache.get(key);
  if (existing) return existing as Intl.NumberFormat;
  const created = build();
  cache.set(key, created);
  return created;
};

const dateFormat = (key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat => {
  const existing = cache.get(key);
  if (existing) return existing as Intl.DateTimeFormat;
  const created = build();
  cache.set(key, created);
  return created;
};

export interface CurrencyOptions {
  currency?: Currency;
  locale?: string;
  /** Drop the cents. Default true — dashboards read better without `.00`. */
  whole?: boolean;
  /** Always show + or −, for deltas. */
  signed?: boolean;
  /** `$12.4k` instead of `$12,400`. */
  compact?: boolean;
}

/** Cents → display string. The only currency formatter in the app. */
export const formatCurrency = (cents: number, options: CurrencyOptions = {}): string => {
  const {
    currency = 'USD',
    locale = DEFAULT_LOCALE,
    whole = true,
    signed = false,
    compact = false,
  } = options;

  const amount = Math.abs(cents) / 100;
  const key = `cur:${locale}:${currency}:${whole}:${compact}`;
  const formatter = numberFormat(key, () =>
    Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }),
  );

  const body = formatter.format(amount);
  if (cents < 0) return `−${body}`;
  return signed && cents > 0 ? `+${body}` : body;
};

/** For deltas, where the direction is the point. */
export const formatDelta = (cents: number, options: CurrencyOptions = {}): string =>
  formatCurrency(cents, { ...options, signed: true });

export const formatPercent = (ratio: number, locale = DEFAULT_LOCALE): string =>
  numberFormat(`pct:${locale}`, () =>
    Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }),
  ).format(ratio);

export const formatCount = (value: number, locale = DEFAULT_LOCALE): string =>
  numberFormat(`num:${locale}`, () => Intl.NumberFormat(locale)).format(value);

/** `•••• 4821`. Accounts arrive already masked; this is presentation only. */
export const formatMask = (mask: string): string => `•••• ${mask.slice(-4)}`;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a timestamp *or* a date-only string.
 *
 * `new Date('2026-08-14')` is midnight **UTC**, which renders as 13 August
 * anywhere west of Greenwich. Bank dates have no time component and must mean
 * the day they say, so a date-only string is anchored to local midnight
 * instead. A bill shown as due a day early is not a formatting nit.
 */
export const parseDate = (value: string): Date => {
  const match = DATE_ONLY.exec(value);
  if (!match) return new Date(value);
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
};

export const formatDate = (
  iso: string,
  style: 'short' | 'medium' | 'weekday' = 'medium',
  locale = DEFAULT_LOCALE,
): string => {
  const date = parseDate(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { month: 'short', day: 'numeric' }
      : style === 'weekday'
        ? { weekday: 'long', month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' };
  return dateFormat(`date:${locale}:${style}`, () => Intl.DateTimeFormat(locale, options)).format(
    date,
  );
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Updated 4 minutes ago".
 *
 * Freshness is load-bearing in this app — the user has to be able to tell
 * whether they are looking at today's money or Tuesday's — so this deliberately
 * never says something vague like "recently".
 */
export const formatRelativeTime = (iso: string | null, now: number = Date.now()): string => {
  if (iso === null) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';

  const elapsed = now - then;
  if (elapsed < 0) return 'just now';
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso, 'short');
};

/**
 * Whole calendar days from today to a due date.
 *
 * Counted between local midnights rather than by elapsed milliseconds: a bill
 * due tomorrow is "in 1 day" whether it is now 9am or 11pm, which is not true
 * of a `(target - now) / 86400000` division.
 */
export const daysUntil = (iso: string, now: number = Date.now()): number => {
  const target = parseDate(iso);
  if (Number.isNaN(target.getTime())) return Number.NaN;

  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  return Math.round((startOfDay(target) - startOfDay(new Date(now))) / DAY);
};

/** "in 3 days", "today", "tomorrow", "2 days ago". */
export const formatDueIn = (iso: string, now: number = Date.now()): string => {
  const days = daysUntil(iso, now);
  if (Number.isNaN(days)) return '—';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 0) {
    const overdue = Math.abs(days);
    return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
  }
  return `in ${days} days`;
};
