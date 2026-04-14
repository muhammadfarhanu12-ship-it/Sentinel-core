function toSafeDate(value: any): Date | null {
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
