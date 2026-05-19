type RiskishRecord = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readScores(record: RiskishRecord): number[] {
  const source = asRecord(record);
  const values: number[] = [];
  for (const key of ['risk_score', 'threat_score', 'riskScore', 'threatScore', 'score', 'security_score', 'risk', 'threat']) {
    const value = asNumber(source[key]);
    if (value !== null) values.push(value);
  }
  return values;
}

export function normalizeRiskScore(...records: RiskishRecord[]): number {
  const candidates = records
    .flatMap(readScores)
    .map((value) => (value <= 1 ? value * 100 : value));

  return Math.round(Math.max(0, Math.min(100, Math.max(0, ...candidates))));
}

export function riskLevelFromScore(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 71) return 'critical';
  if (score >= 46) return 'high';
  if (score >= 21) return 'medium';
  return 'low';
}

export function normalizeRiskLevel(value: unknown, score: number): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) return normalized;
  return riskLevelFromScore(score);
}

export function normalizeVerdict(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (['blocked', 'block', 'denied', 'deny'].includes(normalized)) return 'BLOCKED';
  if (['allow', 'allowed', 'clean'].includes(normalized)) return 'ALLOWED';
  if (['review', 'requires_review', 'force_review', 'review_required'].includes(normalized)) return 'REVIEW REQUIRED';
  if (['warn', 'warning', 'redacted', 'sanitize'].includes(normalized)) return 'WARNING';
  return normalized ? normalized.toUpperCase() : 'UNKNOWN';
}

export function formatRiskScore(score: number): string {
  return `${score} / 100`;
}
