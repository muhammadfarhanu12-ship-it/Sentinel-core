/** Resume a protected app page without accepting arbitrary redirect URLs. */
export function getSignInDestination(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return '/app';
  const from = state.from;
  if (!from || typeof from !== 'object' || !('pathname' in from)) return '/app';
  const pathname = from.pathname;
  if (typeof pathname !== 'string' || !/^\/app(?:\/[a-z0-9-]+)*\/?$/i.test(pathname)) return '/app';
  return pathname;
}
