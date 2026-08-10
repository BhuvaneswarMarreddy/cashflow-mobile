/**
 * Redaction — the boundary that makes logging safe to turn on in production.
 *
 * Two independent defences, because either alone leaks:
 *
 *  1. **By key.** Anything whose field name suggests a credential or an account
 *     identifier is replaced outright, whatever it contains.
 *  2. **By shape.** Values that *look* like a token, a card, an account number
 *     or an email are masked even when the key is innocent — banks put PANs in
 *     `description`, and a JWT arrives as `data`.
 *
 * It also bounds size and depth. An unbounded log line is its own incident: it
 * is how a full API response, including everything nobody meant to log, ends up
 * in a crash report.
 */

export const REDACTED = '[redacted]';

const SENSITIVE_KEY =
  /(pass(word|phrase)?|secret|token|auth|api[-_]?key|credential|cookie|session[-_]?id|ssn|social[-_]?security|pin\b|cvv|cvc|routing|iban|swift|sort[-_]?code|account[-_]?(number|no)|card[-_]?(number|no)|\bpan\b|date[-_]?of[-_]?birth|\bdob\b|access[-_]?token|refresh[-_]?token)/i;

const JWT = /^ey[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*$/;
const BEARER = /^(bearer|basic)\s+\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 9+ digits, optionally grouped — covers cards, account and routing numbers. */
const LONG_DIGIT_RUN = /\b(?:\d[ -]?){8,}\d\b/g;

const MAX_DEPTH = 4;
const MAX_STRING = 512;
const MAX_ARRAY = 50;
const MAX_KEYS = 40;

/** `4111 1111 1111 1234` → `•••• 1234`. Keeps the last four for support. */
const maskDigits = (digits: string): string => {
  const bare = digits.replace(/[^\d]/g, '');
  if (bare.length < 9) return digits;
  return `•••• ${bare.slice(-4)}`;
};

const maskEmail = (value: string): string => {
  const [local = '', domain = ''] = value.split('@');
  const head = local.slice(0, 1) || '•';
  return `${head}•••@${domain}`;
};

export const redactString = (value: string): string => {
  if (JWT.test(value) || BEARER.test(value)) return REDACTED;
  if (EMAIL.test(value)) return maskEmail(value);

  const masked = value.replace(LONG_DIGIT_RUN, maskDigits);
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…[truncated]` : masked;
};

const redactValue = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
  if (value === null || value === undefined) return value;

  switch (typeof value) {
    case 'string':
      return redactString(value);
    case 'number':
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
      return '[function]';
    case 'symbol':
      return value.toString();
    default:
      break;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  const object = value as object;
  if (seen.has(object)) return '[circular]';
  seen.add(object);

  if (Array.isArray(value)) {
    const clipped = value.slice(0, MAX_ARRAY).map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY) clipped.push(`…${value.length - MAX_ARRAY} more`);
    return clipped;
  }

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, entryValue] of entries.slice(0, MAX_KEYS)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(entryValue, depth + 1, seen);
  }
  if (entries.length > MAX_KEYS) output['…'] = `${entries.length - MAX_KEYS} more keys`;
  return output;
};

/** Entry point. Safe to call on anything, including API responses and errors. */
export const redact = <T>(value: T): unknown => redactValue(value, 0, new WeakSet());

export const redactMetadata = (
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined =>
  metadata === undefined ? undefined : (redact(metadata) as Record<string, unknown>);

/** Query strings carry tokens far more often than anyone expects. */
export const redactUrl = (url: string): string => {
  const [path, query] = url.split('?');
  if (!query) return path ?? url;
  const safeQuery = query
    .split('&')
    .map((pair) => {
      const [key = '', rawValue = ''] = pair.split('=');
      return SENSITIVE_KEY.test(key) ? `${key}=${REDACTED}` : `${key}=${redactString(rawValue)}`;
    })
    .join('&');
  return `${path}?${safeQuery}`;
};
