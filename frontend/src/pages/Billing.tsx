import { useStore } from '../stores/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Check, Zap, Shield, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { authedFetchJson } from '../services/authenticatedFetch';

type Subscription = {
  tier: string;
  monthly_limit: number;
  status: string;
  creem_customer_id?: string | null;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
};

type CheckoutResponse = {
  checkout_url?: string;
  checkout_id?: string;
  message?: string;
};

export default function Billing() {
  const { analytics } = useStore();
  const [searchParams] = useSearchParams();
  const returnedFromCheckout = searchParams.get('checkout') === 'success';
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
  const periodEndLabel = periodEnd && Number.isFinite(periodEnd.getTime()) ? periodEnd.toLocaleDateString() : null;

  const loadSubscription = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await authedFetchJson<Subscription>('/api/v1/billing/subscription', undefined, { redirectOnNetworkError: false });
      setSubscription(data);
      return data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshes = 0;

    const refresh = async () => {
      const data = await loadSubscription();
      // Payment confirmation can arrive after the customer returns from checkout.
      // Only the server subscription response determines the active plan.
      if (!disposed && data && returnedFromCheckout && refreshes < 6) {
        refreshes += 1;
        refreshTimer = setTimeout(refresh, 5000);
      }
    };

    void refresh();
    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
    };
  }, [loadSubscription, returnedFromCheckout]);

  const plans = [
    {
      name: 'FREE',
      price: '$0',
      period: '/month',
      description: 'Perfect for testing and small projects.',
      features: [
        '1,000 requests/month',
        'Basic security scanning',
        'Community support',
        '1 API Key'
      ],
      cta: 'Switch to Free',
      popular: false,
      icon: Activity
    },
    {
      name: 'PRO',
      price: '$19',
      period: '/month',
      description: 'For production applications and startups.',
      features: [
        '50,000 requests/month',
        'Deep semantic scanning',
        'Advanced threat detection',
        'Email support',
        '5 API Keys'
      ],
      cta: 'Choose Pro',
      popular: true,
      icon: Zap
    },
    {
      name: 'BUSINESS',
      price: '$49',
      period: '/month',
      description: 'For enterprise teams requiring maximum security.',
      features: [
        '250,000 requests/month',
        'Dedicated threat intelligence',
        'Team dashboard',
        'Priority 24/7 support',
        'Unlimited API Keys'
      ],
      cta: 'Choose Business',
      popular: false,
      icon: Shield
    }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-6xl mx-auto"
    >
      <div className="text-center space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Protect your LLM applications from prompt injections, data leaks, and malicious actors.
        </p>
      </div>

      {(returnedFromCheckout || message) && (
        <div role="status" className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-200">
          {message || 'You have returned from checkout. Your current plan is shown below; payment confirmation may take a moment.'}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
        <p>
          {subscription ? `Current plan: ${subscription.tier}` : isRefreshing ? 'Loading your subscription...' : 'Subscription status is unavailable.'}
        </p>
        <div className="flex flex-wrap gap-3">
          {subscription?.creem_customer_id && (
            <Button
              variant="outline"
              disabled={isOpeningPortal || isLoading}
              onClick={async () => {
                setError(null);
                setIsOpeningPortal(true);
                try {
                  const data = await authedFetchJson<{ customer_portal_url: string }>('/api/v1/billing/customer-portal', {
                    method: 'POST',
                  }, { redirectOnNetworkError: false });
                  if (!data?.customer_portal_url) throw new Error('The billing portal link was not returned. Please try again.');
                  window.location.assign(data.customer_portal_url);
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Unable to open the billing portal');
                } finally {
                  setIsOpeningPortal(false);
                }
              }}
            >
              {isOpeningPortal ? 'Opening billing...' : 'Manage billing'}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={isRefreshing || isLoading || isOpeningPortal}
            onClick={() => {
              setError(null);
              void loadSubscription();
            }}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh status'}
          </Button>
        </div>
      </div>

      {subscription?.cancel_at_period_end && (
        <p role="status" className="text-sm text-amber-200">
          Your subscription will not renew. Paid access continues {periodEndLabel ? `until ${periodEndLabel}` : 'until the end of the current billing period'}, then your account switches to Free.
        </p>
      )}

      {analytics && (
        <Card className="bg-slate-900/40 border-white/5 mb-12">
          <CardHeader>
            <CardTitle>Current Usage</CardTitle>
            <CardDescription>{subscription ? `You are currently on the ${subscription.tier} plan.` : 'Checking your current plan.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">API Requests</span>
                <span className="font-medium text-slate-200">{analytics.usageVsLimit.used.toLocaleString()} / {analytics.usageVsLimit.limit.toLocaleString()}</span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(analytics.usageVsLimit.used / analytics.usageVsLimit.limit) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">Resets in 12 days</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card 
            key={plan.name} 
            className={`relative flex flex-col ${plan.popular ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/10 bg-slate-900/80' : 'border-white/5 bg-slate-900/40'}`}
          >
            {plan.popular && (
              <div className="absolute -top-3 inset-x-0 flex justify-center">
                <span className="bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most Popular
                </span>
              </div>
            )}
            <CardHeader>
              <div className="flex items-center space-x-2 mb-2">
                <plan.icon className={`w-5 h-5 ${plan.popular ? 'text-indigo-400' : 'text-slate-400'}`} />
                <CardTitle className="text-lg text-slate-300">{plan.name}</CardTitle>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-slate-400">{plan.period}</span>
              </div>
              <CardDescription className="pt-4">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-slate-300">
                    <Check className="w-4 h-4 text-clean shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                variant={plan.popular ? 'default' : 'outline'}
                disabled={isLoading || isOpeningPortal || !subscription || subscription.tier === plan.name || (plan.name === 'FREE' && subscription.cancel_at_period_end)}
                onClick={async () => {
                  if (!subscription || subscription.tier === plan.name) return;
                  setError(null);
                  setMessage(null);
                  setIsLoading(true);
                  try {
                    const data = await authedFetchJson<CheckoutResponse>('/api/v1/billing/create-checkout-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ plan_name: plan.name }),
                    }, { redirectOnNetworkError: false });
                    if (data?.checkout_url) {
                      window.location.assign(data.checkout_url);
                      return;
                    }
                    if (plan.name !== 'FREE') {
                      throw new Error(data?.message || 'The checkout link was not returned. Please try again.');
                    }
                    setMessage(data?.message || 'Your plan change has been requested.');
                    await loadSubscription();
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Checkout failed');
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                {subscription?.tier === plan.name ? 'Current Plan' : plan.name === 'FREE' && subscription?.cancel_at_period_end ? 'Cancellation scheduled' : isLoading ? 'Working...' : plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {error && (
        <div role="alert" className="mt-8 text-center text-sm text-red-300 bg-red-900/20 border border-red-900/40 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="mt-16 text-center">
        <p className="text-sm text-slate-500 flex items-center justify-center space-x-2">
          <Shield className="w-4 h-4" />
          <span>Secure checkout is required for paid plan activation. Plans activate after payment confirmation.</span>
        </p>
      </div>
    </motion.div>
  );
}
