// Public plan prices match Billing.tsx. Limits mirror backend-ai/app/core/tier.py.
// Backend entitlements remain authoritative for every authenticated request.
export const PUBLIC_PLANS = [
  {
    id: 'FREE',
    name: 'Free',
    monthlyPrice: 0,
    monthlyRequests: 1_000,
    rateLimit: 30,
    maxPromptChars: 4_000,
    apiKeys: 1,
    retentionDays: 7,
  },
  {
    id: 'PRO',
    name: 'Pro',
    monthlyPrice: 19,
    monthlyRequests: 50_000,
    rateLimit: 300,
    maxPromptChars: 12_000,
    apiKeys: 5,
    retentionDays: 30,
  },
  {
    id: 'BUSINESS',
    name: 'Business',
    monthlyPrice: 49,
    monthlyRequests: 250_000,
    rateLimit: 1_200,
    maxPromptChars: 25_000,
    apiKeys: null,
    retentionDays: 365,
  },
] as const;
