# LaunchReady commerce operations

The storefront is a Sites-hosted Vinext application. Its private D1 database and R2 bucket are separate from the public Scout SQLite database. Paid product bytes are uploaded to R2 and are not in this repository.

## Current release

- SKU: `launchready-v1`
- Proposed price: USD 9.00, one time
- Product: original rebuilt software validation and launch kit, 11 files
- The referenced Phase 2 attachment was unavailable; no claims are made about its contents.
- Support: `back2edenscapes@gmail.com`
- Storefront: https://built4god-launchready.wearebuilt4god.chatgpt.site
- No verified sales or validated willingness to pay at initial deployment.

## Runtime configuration

Set production values using Sites environment tools; never put secrets in source, GitHub variables, browser code, or hosting.json.

| Key | Purpose |
| --- | --- |
| `STRIPE_MODE` | `test` for a sandbox; `live` for real payments |
| `STRIPE_PAYMENT_LINK_URL` | Exact `https://buy.stripe.com/...` URL |
| `STRIPE_PAYMENT_LINK_ID` | Corresponding `plink_...` identifier |
| `STRIPE_WEBHOOK_SECRET` | Secret for this endpoint and environment |
| `PRICE_CENTS` | Expected product subtotal; currently 900 |
| `SUPPORT_EMAIL` | Existing monitored customer support inbox |
| `PRODUCT_SHA256` | SHA-256 of the approved ZIP |
| `ADMIN_TOKEN` | Secret only for product upload and readiness checks |
| `REPORT_TOKEN` | Separate read-only aggregate-report credential |
| `LIVE_SALES_ENABLED` | Must explicitly be `true` before checkout redirects |

The readiness gate checks the support address, database schema, configured mode, hosted Stripe link, webhook secret, expected price, and private product checksum. Missing configuration keeps checkout closed. A successful health check alone does not prove Stripe account eligibility or webhook connectivity.

## Stripe setup

1. Reconnect the existing Stripe integration and explicitly select an account/sandbox. Do not create a second account accidentally. First verify the pipeline in a dedicated sandbox.
2. Create a one-time product and price matching the listing. No recurring charges, coupons, adjustable quantities, or discount codes are supported by this initial release. Payment Link quantities must be fixed at one. Never infer active tax registrations; automatic tax is not enabled by this integration.
3. Create a Payment Link for that price. Set its metadata `sku=launchready-v1`, which Stripe copies to generated Checkout Sessions. Configure post-payment redirect to `https://built4god-launchready.wearebuilt4god.chatgpt.site/delivery?session_id={CHECKOUT_SESSION_ID}`. The reference is a bearer credential; it must never be added to analytics or public logs.
4. Register a snapshot webhook endpoint at `/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`. `checkout.session.async_payment_failed` can be subscribed for observability, but it never grants access. Use the signing secret for the exact endpoint and mode. This endpoint must be publicly reachable for Stripe; private Sites authentication prevents external webhook delivery.
5. Configure the runtime values above and deploy the saved Site version to apply them. Test payment, cancellation, delayed confirmation, malformed signature, duplicate events, and refund revocation. A real Stripe sandbox checkout has not been tested merely because local fixtures pass.
6. Before switching to live mode, confirm the Stripe account can accept charges and receive payouts, support and refund terms are correct, and any tax requirements have been reviewed. Configure a separate live Payment Link and live endpoint signing secret. Do not mix sandbox and live credentials or orders.

The app never receives card details. It verifies Stripe's timestamped HMAC-SHA256 signatures over the unmodified body with a five-minute tolerance and WebCrypto verification. It only grants orders matching paid status, payment mode, configured Payment Link, SKU, currency, and exact product subtotal. Client-controlled success pages cannot grant access. Data writes are atomic, deduplicated by session/payment/event IDs, and refund amounts are monotonic, so an out-of-order payment event cannot restore a refunded download.

## Delivery

Upload the approved ZIP using authenticated `PUT /api/admin/product` with `Authorization: Bearer <ADMIN_TOKEN>`. The server accepts only bytes matching `PRODUCT_SHA256` and stores that checksum as private R2 metadata. Never include the ZIP in a public GitHub artifact or public download folder.

After payment confirmation the browser POSTs its session reference to `/api/order` and `/api/download`. The database stores only its SHA-256 hash. The browser moves the return reference from its query string into a fragment, suppresses referrers, and sends it in request bodies. Bookmarking that private return link provides repeat access. Refunds revoke future downloads. The public sample is separate from paid delivery.

No automatic product email is sent by this version. Stripe payment receipts and return-page access must be clearly distinguished. If a buyer loses their return link, support can locate their Checkout Session in Stripe and provide the matching private delivery link after verifying ownership. Future receipt-email delivery requires a separately configured email service and consent-sensitive handling.

## Revenue reporting

`GET /api/admin/revenue` requires the read-only `REPORT_TOKEN`. It returns only live-mode USD totals: paid orders, gross product subtotal, refunded subtotal capped to the product amount, and net before fees. Taxes, processor fees, chargebacks and disputes, support labor, and profit are not included. These totals are not a complete accounting ledger. Partial refunds revoke future downloads conservatively.

GitHub workflow **Verified revenue report** runs daily at 07:43 UTC. Repository variable `COMMERCE_SITE_URL` points to this Site. Secrets `COMMERCE_REPORT_TOKEN` and (while private) `COMMERCE_SITE_SERVICE_TOKEN` authorize read-only reporting. Only validated aggregate fields are written under `output/revenue/`; customer records and bearer references never leave D1. Missing credentials or failed requests fail visibly and preserve the last good report. They do not fabricate zero earnings.

Scout continues every six hours. Its automatic drafts remain research outputs and do not overwrite the approved product or enable sales. A product release requires quality review and deliberate upload; news headlines alone are not purchase validation.

## Tests and maintenance

From the repository root:

```sh
python -m unittest discover -s tests -v
node --test commerce/tests/commerce.test.mjs
```

The commerce tests use an isolated in-memory SQLite database and explicit fictional fixtures. They test signatures, amount/product/mode checks, idempotency, delayed success, out-of-order refunds, download access, checkout redirects, upload checksums, and redacted revenue output. Fixtures are never deployed as orders.

For full application builds, install the locked dependencies in `commerce/` and follow the Sites workflow. The checked-in migration history is immutable after deployment. Append schema migrations for changes. Never initialize production tables during a web request.

The storefront and free sample are public, as authorized by the owner. The paid ZIP remains in private R2 storage and the admin endpoints remain credential-protected. Public anonymous health access has been verified. Stripe checkout remains closed pending account reconnection, Payment Link creation, endpoint configuration, and an external sandbox payment test. No automatic messages, advertisements, purchases, or sales claims are generated.
