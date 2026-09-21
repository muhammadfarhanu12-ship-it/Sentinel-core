# Creem billing deployment

Mefyx sends paid customers to Creem checkout and grants paid access only after a verified successful-payment webhook. Creating a checkout or returning to the dashboard does not activate a paid tier. Billing requires the backend's MongoDB connection.

## Create the products

Select test mode in the Creem dashboard and create two products matching the existing Mefyx prices:

| Product | Mefyx tier | Currency | Price in cents | Billing |
| --- | --- | --- | ---: | --- |
| Mefyx Pro | `PRO` | `USD` | `1900` ($19) | Recurring, every month |
| Mefyx Business | `BUSINESS` | `USD` | `4900` ($49) | Recurring, every month |

For API-created products, use `billing_type=recurring` and `billing_period=every-month`. Disable trials for both products; this integration requires payment before granting paid access. Keep checkout upsells disabled because the initial payment must match the product recorded when Mefyx created the checkout. Copy each product's distinct ID into its backend variable. No product is needed for Free. See the [Creem API reference](https://docs.creem.io/skills/creem-api/REFERENCE) for product fields and cent-based prices.

For subsequent plan changes through **Manage billing**, put Pro and Business into a product bundle and enable its self-service upgrades. The portal permits switching between eligible products in such a bundle. See [Creem customer portal limitations](https://docs.creem.io/features/customer-portal#limitations).

## Configure Render

Add these settings to the Render backend service. For local development, use `backend-ai/.env` instead.

| Variable | Value |
| --- | --- |
| `CREEM_API_KEY` | API key for the selected Creem environment |
| `CREEM_WEBHOOK_SECRET` | Signing secret for the webhook endpoint in that environment |
| `CREEM_PRODUCT_ID_PRO` | Product ID for the monthly Pro product |
| `CREEM_PRODUCT_ID_BUSINESS` | Product ID for the monthly Business product |
| `CREEM_TEST_MODE` | `true` for test mode; explicitly set `false` for live payments |
| `FRONTEND_URL` | Existing setting: the frontend origin, such as `https://your-frontend.vercel.app` |
| `BACKEND_PUBLIC_URL` | Existing setting: the public backend origin, such as `https://your-backend.onrender.com` |

The five `CREEM_*` variables are the new billing settings. Keep credentials on the backend; no Creem secret belongs in frontend `VITE_*` variables or committed files. Render does not read local `.env` files. Configure its service environment and redeploy after changes.

`CREEM_TEST_MODE` defaults to `true`, including when `APP_ENV=production`. Test requests use `https://test-api.creem.io`; live requests use `https://api.creem.io`. API keys, products, and webhook secrets must all belong to the selected environment. See [Creem test mode](https://docs.creem.io/getting-started/test-mode).

The backend automatically supplies this browser return URL:

```text
FRONTEND_URL + /app/billing?checkout=success
```

## Register the webhook

In the Creem dashboard's Developers / Webhooks area, register this public HTTPS backend endpoint:

```text
POST https://your-backend.onrender.com/api/v1/billing/webhooks/creem
```

Replace the origin with `BACKEND_PUBLIC_URL`. Use the backend origin here; the frontend billing page is only the browser return destination. Copy the endpoint's signing secret into `CREEM_WEBHOOK_SECRET` and redeploy.

Subscribe to these events:

```text
checkout.completed
subscription.paid
subscription.active
subscription.update
subscription.scheduled_cancel
subscription.canceled
subscription.expired
subscription.past_due
subscription.unpaid
subscription.paused
```

The endpoint accepts provider requests without a user login and verifies `creem-signature` using HMAC-SHA256 over the original request bytes before processing JSON. The request body must reach the application without being rewritten. Creem retries failed deliveries, and events can also be resent from its dashboard. See [Creem webhooks](https://docs.creem.io/code/webhooks).

## Subscription behavior

| Event or action | Mefyx behavior |
| --- | --- |
| Create a paid checkout | Returns `checkout_url` and `checkout_id`; current tier remains unchanged |
| Browser returns from checkout | Refetches subscription status; query parameters grant no access |
| `checkout.completed` | Grants the configured tier only for a completed checkout with a paid order linked to the account's checkout |
| `subscription.paid` | Activates or renews the configured paid tier for the linked subscription |
| `subscription.active`, or `subscription.update` with `active` status | Synchronizes the same subscription/product only after a confirmed payment; never creates a new paid entitlement |
| `subscription.scheduled_cancel` | Records cancellation at period end and preserves existing paid access |
| `subscription.past_due` | Records the payment issue while retaining the existing tier during payment recovery |
| `subscription.unpaid`, `subscription.paused`, `subscription.canceled`, `subscription.expired` | Removes paid access and restores Free limits |
| `subscription.update` with a supported cancellation/payment-failure status | Applies the corresponding lifecycle state above |
| Choose Free while a subscription is managed by Creem | Requests cancellation at period end; the webhook confirms the billing state |

Product IDs map to tiers on the backend. Repeated processed event IDs are ignored, and older events cannot overwrite a newer subscription state. Creem customer and subscription IDs are stored for subsequent billing management.

An active-state event can clear a scheduled cancellation for an established paid subscription. It can restore a paused subscription only within the paid period already verified by a successful-payment event. It cannot grant an unpaid first subscription or extend a previously verified paid term. Other suspended states require a successful-payment event before paid access returns.

Only `canceled` is treated as terminal for creating another subscription. An expired subscription can still retry billing, so `expired`, `unpaid`, and `paused` subscriptions continue to block another paid checkout even though paid access has been removed. Use **Manage billing** to manage the existing subscription and payment method. This prevents creating a second subscription while the first could still collect payment.

## Verify test mode, then go live

Implementation checks use mocked provider HTTP responses and signed test payloads. No real Creem credentials or complete Creem checkout-to-webhook flow were used during implementation. The test-mode default does not mean a real sandbox payment has been completed.

Before enabling live payments:

1. Deploy with test credentials, test product IDs, and `CREEM_TEST_MODE=true`. Register the test webhook and its signing secret.
2. Sign in to a fresh test account and choose Pro or Business at `/app/billing`. Confirm the account remains Free before payment.
3. Complete a test checkout using [Creem's documented test payment method](https://docs.creem.io/getting-started/test-mode). Inspect webhook delivery results, then use **Refresh status** and confirm the correct plan and quota.
4. Resend the successful event from Creem and confirm it does not apply twice. Verify cancellation, payment failure, and portal plan changes for both products.
5. Create corresponding live products with trials and checkout upsells disabled, and configure the live bundle. Register the live webhook on the intended backend. Replace the API key, both product IDs, and webhook secret together, set `CREEM_TEST_MODE=false`, and redeploy.
6. Use a separate database for sandbox billing, or reconcile and clean test accounts before switching an environment to live. The application rejects linked subscriptions from another payment environment. Changing the flag does not migrate customers or subscriptions.

Run the automated suite separately; this guide does not certify a passing test run. From the repository root:

```powershell
cd backend-ai
python -m pytest -p no:cacheprovider
```

## Troubleshooting

- **Checkout is not configured:** confirm the API key, webhook secret, and distinct product IDs are set in the running backend environment.
- **Payment succeeded but the plan is unchanged:** inspect Creem webhook delivery results, confirm the endpoint URL and signing secret, and resend the successful-payment event after resolving the error. A return URL or `subscription.active` event alone never grants a new paid entitlement; active-state events only synchronize an established paid subscription as described above.
- **Another checkout is pending:** a pending checkout for the same plan can be reused when its provider checkout ID is known. An expired checkout can be cleared after the backend confirms its expiration with Creem. Checkout expiration is different from subscription expiration.
- **Checkout creation timed out and its ID is missing:** the provider may already have created it. The application keeps the account's pending hold instead of automatically creating another potentially chargeable subscription. Reconcile the internal request ID with the Creem dashboard and replay the matching webhook where possible. A maintainer must reconcile provider state and the matching `billing_checkouts`/user records before clearing an unresolved hold. There is no automatic recovery endpoint for a missing checkout ID.
- **Manage billing cannot change plans:** check the product bundle and its self-service upgrade setting in the same Creem environment.
- **Environment mismatch:** use matching credentials and products and a clean account for the selected environment. Test subscriptions do not become live subscriptions when `CREEM_TEST_MODE` changes.
