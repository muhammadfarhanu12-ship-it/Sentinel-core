export const SITE_URL = 'https://mefyx.com';

export const LANDING_TITLE = 'Mefyx | AI Security Firewall for LLM Applications';
export const LANDING_DESCRIPTION =
  'Mefyx helps teams inspect AI prompts, detect prompt injection, redact sensitive data, and monitor AI security traffic.';

export const ROBOTS_NOINDEX = 'noindex, nofollow';

export const CRAWLABLE_PUBLIC_ROUTES = ['/', '/terms', '/privacy', '/refunds'];

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
