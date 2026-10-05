export const SITE_URL = 'https://mefyx.com';

export const LANDING_TITLE = 'Mefyx | Security for AI Agents That Handle Money';
export const LANDING_DESCRIPTION =
  'Stop AI agents from leaking money and financial data. Mefyx blocks prompt injection, redacts sensitive data, and requires approval for risky financial actions.';

export const ROBOTS_NOINDEX = 'noindex, nofollow';

export const CRAWLABLE_PUBLIC_ROUTES = ['/', '/security', '/terms', '/privacy', '/refunds'];

export const AUTH_ROUTE_PATHS = [
  '/signin',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/reset',
  '/oauth/callback',
  '/verify-email',
  '/verify',
];

export const AUTH_GATED_ROUTE_PREFIXES = ['/app', '/admin'];

export const SOFTWARE_APPLICATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Mefyx',
  url: SITE_URL,
  applicationCategory: 'SecurityApplication',
  operatingSystem: 'Web',
  description: LANDING_DESCRIPTION,
  featureList: [
    'Direct and indirect prompt injection detection',
    'PII and secrets redaction',
    'Financial transaction-risk guardrails with MFA and human approval',
    'Gateway Run and Security Scan modes',
    'Real-time monitoring and audit logs',
    'Email alerts',
    'Team workspaces and API keys',
    'OpenAI, Gemini, Claude, and Grok support',
  ],
} as const;

export function canonicalUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function isNoindexPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (AUTH_ROUTE_PATHS.includes(normalizedPath)) return true;

  return AUTH_GATED_ROUTE_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}
