import { format } from 'date-fns';

export function toSafeDate(value: any): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function safeFormatDate(value: any): string {
  if (!value) return '—';
  const date = toSafeDate(value);
  if (!date) return '—';
  return date.toLocaleString();
}

export function safeFormatDateWithPattern(value: any, pattern: string): string {
  const date = toSafeDate(value);
  if (!date) return '—';
  try {
    return format(date, pattern);
  } catch {
    return '—';
  }
}

export function safeToISOString(value: any): string | undefined {
  const date = toSafeDate(value);
  return date ? date.toISOString() : undefined;
}

export function safeTimeValue(value: any): number | null {
  const date = toSafeDate(value);
  return date ? date.getTime() : null;
}
