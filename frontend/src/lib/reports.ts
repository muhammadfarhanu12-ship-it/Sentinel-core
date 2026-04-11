export type Granularity = 'daily' | 'weekly';

export type ThreatCountsPoint = {
  period_start: string;
  blocked: number;
  redacted: number;
  clean: number;
  total: number;
};

export type ThreatCountsResponse = {
  granularity: Granularity;
  start_time: string;
  end_time: string;
  series: ThreatCountsPoint[];
};

export function buildReportsQuery(input: {
  granularity: Granularity;
  days: number;
  startTime?: string;
  endTime?: string;
}) {
  const q = new URLSearchParams();
  q.set('granularity', input.granularity);
  q.set('days', String(input.days));
  if (input.startTime) q.set('start_time', new Date(input.startTime).toISOString());
  if (input.endTime) q.set('end_time', new Date(input.endTime).toISOString());
  return q.toString();
}

export function summarizeThreatCounts(series: ThreatCountsPoint[]) {
  return (Array.isArray(series) ? series : []).reduce(
    (acc, p) => {
      acc.blocked += Number(p?.blocked || 0);
      acc.redacted += Number(p?.redacted || 0);
      acc.clean += Number(p?.clean || 0);
      acc.total += Number(p?.total || 0);
      return acc;
    },
    { blocked: 0, redacted: 0, clean: 0, total: 0 },
  );
}

export function formatPeriodLabel(iso: string, granularity: Granularity) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Weekly uses the bucket start date as label.
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

