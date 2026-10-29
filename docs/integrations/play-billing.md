# Google Play Billing — Phase 4

**Status: implemented end to end with Mock store + server verification. NOT verified on device / against the real Play Developer API.** Every grant happens only after the server verifies the purchase.

## Required accounts / setup
1. **Play Console app** with package `com.emergent.rushrivalsrun.olzash`. Upload a release build to an internal testing track (Billing only works for builds installed from Play). Add licence testers.
2. **One-time products.** Create them with exactly these placeholder IDs, or change both `mobile/src/monetization/products.ts` and `backend/rr/catalog.py` (`PRODUCTS`):

   | Product ID | Type | Grant |
   |---|---|---|
   | `rr_coins_10k` | consumable | 10,000 coins |
   | `rr_coins_60k` | consumable | 60,000 coins |
   | `rr_gems_100` | consumable | 100 gems |
   | `rr_gems_550` | consumable | 550 gems |
   | `rr_gems_1200` | consumable | 1,200 gems |
   | `rr_starter_bundle` | non-consumable | 20,000 coins + 100 gems + 5 hoverboards |
   | `rr_bundle_neon` | non-consumable | Zoe + Neon board |
   | `rr_bundle_inferno` | non-consumable | Shadow + Flame board |
   | `rr_remove_ads` | non-consumable | `remove_ads` entitlement |

   Prices are set in Play Console and shown localised from `fetchProducts`.
3. **Service account.** In Google Cloud, create a service account and download its JSON key. In Play Console → Users & permissions, invite it with "View financial data" and "Manage orders and subscriptions".
4. **RTDN.** Create a Pub/Sub topic and grant `google-play-developer-notifications@system.gserviceaccount.com` the Publisher role on it. Set the topic in Play Console → Monetization setup. Create a **push** subscription with authentication enabled: pick a service account; audience = the endpoint URL.

## Env vars (backend/.env, Deployment → Secrets)
| Var | Purpose |
|---|---|
| `ANDROID_PACKAGE_NAME` | Package used for verification (already set). |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full service-account JSON on one line. **If missing, real tokens return 503 `verification_unavailable`, and nothing is ever auto-granted.** |
| `ENV` | `development` accepts `mock_` tokens (preview). Any other value (default `production`) rejects them with `mock_token_rejected`. **Set `ENV=production` in deployment secrets.** |
| `PUBSUB_AUDIENCE` | Audience configured on the push subscription (e.g. `https://<backend>/api/v1/billing/rtdn`). |
| `PUBSUB_PUSH_SERVICE_ACCOUNT` | The push subscription's service-account email. |

## Client (`expo-iap@6.3.0`, Play Billing Library 8)
- **`src/monetization/billingNative.ts`.** Lazy-requires `expo-iap`, so web and Expo Go fall back to the Mock adapter.
  - Connect: `initConnection`.
  - Products and prices: `fetchProducts({skus, type:'in-app'})`.
  - Buy: `requestPurchase({request:{google:{skus}}, type:'in-app'})`.
  - Results arrive through `purchaseUpdatedListener` / `purchaseErrorListener`.
  - Finish: `finishTransaction({purchase, isConsumable})`. Consumable means consume; non-consumable means acknowledge.
  - Restore and reconcile: `getAvailablePurchases`.
- **`src/monetization/billingCore.ts`** (pure, jest-tested) — `BillingEngine`:
  1. `buy`: already owned → `already_owned`. Connect fails, or the adapter reports `unavailable` → `store_unavailable`. User cancels → `cancelled`. Error → `failed` with a reason (Retry button). The Mock adapter also times out after 30 s → `failed`. **The native adapter has no timeout:** the Google Play sheet is user-driven, and a timeout could wrongly say "nothing was charged".
  2. Pending purchase → `pending` ("you'll get your items when payment completes"). Nothing is granted. The later `purchased` callback, delivered via `onLatePurchase`, is verified and then granted once.
  3. `handle`: verify on the server → grant (idempotent per token) → finish.
  4. If verification fails with `verification_unavailable` or a network/5xx error, the state is `deferred` ("We'll finish your purchase shortly"). The purchase is **left unfinished**, so Play keeps it and won't auto-refund within 3 days.
  5. Duplicate callbacks for a token are ignored while one is in flight.
  6. `reconcile()` runs on every launch from `MonetizationHost` and finishes anything unacknowledged.
  7. `restore()` re-verifies owned non-consumables.
- **`app/shop.tsx`:**
  - Coins / Gems / Offers tabs; real-money items are labelled "Paid · real money".
  - A state dialog covers processing, success, cancelled, failed + Retry, pending, already owned, store unavailable + Retry, and deferred.
  - Restore purchases button.
  - **A parental gate (math challenge) runs before any purchase in child mode.**
- **Mock adapter** (`src/services/billing.ts`). Every dialog is labelled "TEST MODE — no real ad / no real charge". The outcome picker offers success / cancel / declined / pending / timeout / store unavailable. Pending purchases can be completed with "Complete pending payment (TEST)". Tokens are `mock_<uuid>`.

## Server (`backend/rr/billing.py`, `rr/routers/billing.py`)
### Endpoints
- **`POST /api/v1/purchases/verify {product_id, purchase_token}`.** Auth optional. Guests send `X-Device-Id` and own the purchase as `dev:<id>`.
  1. If the token was already processed for the same owner → `already_processed`; nothing is granted again.
  2. If it belongs to a different owner: consumables → 409 `purchase_owned_elsewhere`; non-consumables → entitlement (and items) restored, never currency.
  3. Otherwise the server calls `GET androidpublisher/v3/applications/{pkg}/purchases/products/{productId}/tokens/{token}`. `purchaseState` 0 = purchased, 2 = pending (no grant), 1 = cancelled → 400.
  4. On success it inserts into `iap_purchases` (**unique index on `purchase_token`**; concurrent duplicates hit DuplicateKey → `already_processed`).
  5. Signed-in grants go to the wallet with a `ledger` entry `iap` and to inventory. `entitlements` are upserted.
- **`GET /api/v1/entitlements`** → `{entitlements, remove_ads}`. The app syncs this on launch, so a refund removes Remove Ads.
- **`GET /api/v1/purchases/mine`** lists purchases per user; the Phase 6 admin reads `iap_purchases` by `owner`.
- **`POST /api/v1/billing/rtdn`** (Pub/Sub push).
  - Verifies the `Authorization: Bearer` OIDC JWT with `google.oauth2.id_token.verify_oauth2_token`, checking the audience, `email` and `email_verified`. Returns 401 if invalid, or 503 if not configured.
  - Deduplicates by `messageId` and checks `packageName`.
  - Revokes on `voidedPurchaseNotification` or `oneTimeProductNotification` type 2 (cancelled).
- **Voided Purchases poll.** `poll_voided()` runs every 6 h in the background (`voided_loop`, started on server startup) and is a no-op until Play is configured. It reads `purchases/voidedpurchases` (last 2 days, paginated).

### Revocation (`revoke`)
- Idempotent.
- Marks the purchase revoked and deactivates its entitlements.
- Claws back currency granted to a signed-in user, capped at the current balance so it never goes negative, and writes an `iap_refund` ledger entry.

## Tests
- **pytest `tests/test_phase4.py`:**
  - verify grants once and a duplicate token is a no-op;
  - 10 concurrent duplicates grant once;
  - another owner's token is rejected;
  - **mock tokens are rejected in production**;
  - unconfigured verification never grants;
  - pending never grants;
  - guest Remove Ads restore + refund revocation;
  - refund claws back currency with a ledger entry;
  - RTDN voided revokes and dedupes;
  - RTDN unconfigured / bad JWT.
- **jest `src/monetization/__tests__/monetization.test.ts`:** billing state machine, duplicate callbacks, pending → purchased, deferred-on-unavailable, reconcile/restore, revoked.

## Production verification status
None of these has been verified:
- real Play purchase, consume or acknowledge;
- Play Developer API verification with a real service account;
- RTDN delivery and JWT verification against real Google tokens;
- a Voided Purchases poll against real data;
- licence-tester flows (including slow / declined test cards).
