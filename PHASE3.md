# Phase 3 — customer experience and acquisition

## Deployed behavior

The existing Wearebuilt4god live Stripe Payment Link, price and private R2 product are preserved. No real purchase or refund was performed for Phase 3 testing. The storefront, interactive free preview, delivery instructions, account-free recovery, policies, and owner growth dashboard were updated in the existing public Site.

BUILT 4 GOD AI is separate from Back 2 Eden. The former support email was removed from the Site runtime and the Payment Link's custom text. No replacement address is invented. `SUPPORT_MODE=pending` explicitly preserves checkout as requested while visibly flagging that a dedicated support contact must be verified. This is a material operating limitation: direct support and refund-request handling needs the owner to provide a verified contact promptly. Existing Stripe account display name Cory Brown is preserved.

## Recovery and email

A confirmed buyer can create a 256-bit private recovery code on `/delivery`. It is displayed once; only its SHA-256 hash is stored. `/recover` accepts that code and verifies payment and refund status. No account, email address, customer lookup, or public product URL is required. The original checkout reference continues to work. If both credentials are lost, automatic ownership verification is unavailable. Codes are bearer credentials: keep them private. Refunds revoke all download methods, including codes and expiring email links.

The optional transactional email integration is implemented and tested but **disabled**. Its current adapter targets Resend and is not a claim that Resend can send production mail from an unverified free address. A verified sender, dedicated support contact and provider credential are prerequisites. No customer email addresses are collected by the disabled email flow. No email deliverability claim is made.

When enabled with a suitable verified sender, signed paid webhooks enqueue one encrypted delivery payload per purchase. A 24-hour random access token is stored as a hash; addresses and pending payloads use AES-GCM under a secret runtime key. The provider receives only the destination and delivery instructions, not payment card details or a public R2 URL. Database leases and stable provider idempotency keys prevent concurrent/retried sends. Retry bodies remain identical. Resend idempotency expires after 24 hours, so the queue stops automatic retries before that window ends and flags manual support. Acknowledgement means accepted by the provider, not inbox delivery. Delivery/bounce testing remains required before enabling email. Hourly retry jobs supplement immediate webhook handling; quotas conservatively cap attempts at 90/day and 2,800/month.

### Domain-free provider research, checked 2026-10-18

- [AgentMail pricing](https://www.agentmail.to/pricing): free, no credit card, provider-domain inboxes; pricing lists 3 inboxes, 3,000 emails/month and 100/day. [Default domain guidance](https://www.agentmail.to/docs/knowledge-base/custom-domain-setup) confirms free `@agentmail.to` addresses. This is the strongest domain-free candidate, not an activated service.
- [AgentMail verification limits](https://www.agentmail.to/docs/knowledge-base/agent-sign-up-limits): agent-created accounts initially send only to their attached human. Human verification/claim is necessary before customer sending, with initial new-recipient limits. Its knowledge base and pricing page differ on the monthly limit; use the conservative pricing limit until the actual account confirms entitlement. No inbox/address has been created or represented as working.
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction) requires an owned verified sending domain for production sending. [Free plan](https://resend.com/pricing?product=transactional) is not a workaround for sender verification. The unused Resend adapter remains gated.
- [Brevo sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders) describe temporary address replacement for free-domain senders; this is a stopgap, not a verified dedicated identity. [Mailjet](https://documentation.mailjet.com/hc/en-us/articles/360042561514-Understanding-SPF-and-how-it-works) discourages free-webmail senders because SPF/DKIM cannot be configured there.

Stripe Projects' catalog includes AgentMail and Resend free options, but Projects provisioning is not signed in locally. Its preflight returned `BROWSER_AUTH_REQUIRED`. No paid plan, domain, ownership change or unverified sender was provisioned. Account-free recovery remains the active fallback.

## Analytics and reviews

`/api/analytics` accepts only bounded event and source categories. It stores day/event/source counts, not IPs, full referrers, customer identities, checkout references or recovery codes. The browser stores only a session source category and honors DNT/GPC. Checkout tracking is best effort and cannot prevent redirecting to Stripe. Monitoring requests set DNT and do not add synthetic checkout clicks. Browser QA pageviews can appear in the aggregate counts; these are not all qualified prospects or unique visitors.

Source tags are client supplied. They help compare distribution experiments but are not verified provenance. Paid-order source categories arrive through Payment Link `client_reference_id`; they never affect entitlement. Direct purchases that bypass the storefront may have unknown attribution. Rates use verified orders since analytics activation divided by measured storefront pageviews; repeat loads, bots and opt-outs limit interpretation. An empty denominator is `null`, not a fabricated 0% rate. Financial totals remain live-webhook verified; refunds are deducted. Processor fees and net after fees remain unavailable, not zero.

`/growth` uses the existing read-only report credential, held only in page memory. `/api/admin/growth` requires that credential and returns aggregates. Public source and GitHub reports do not contain customer records. The original daily revenue workflow is unchanged.

## Marketer agent and publishing gate

Run `python -m built4god.marketer run`. It reuses the existing authorized RSS parser, freshness filtering and canonical URL deduplication in a separate `data/marketer.sqlite3`. News is context, not evidence of willingness to pay; keyword search volume is explicitly unavailable. Drafting uses original, bounded editorial templates instead of paid AI APIs. At most one new topic draft per UTC day is generated. Used topics and body hashes prevent repetition. When the reviewed topic library is exhausted, it holds the existing queue rather than generating filler.

The campaign in `marketing/` includes 3 positioning options, 5 social drafts, 2 complete SEO articles, a demonstration script, a 7-day plan, a 30-day roadmap/calendar, and 12 ranked distribution candidates with dated rules. Generated material is prohibited from Hacker News and r/Entrepreneur. Several other communities remain manual rule-verification gates. No external publication or outreach occurred.

`record-publication --id ID --url HTTPS_URL --owner-approved` records an already approved and published item; it does not publish anything. Review the actual external URL and community rules before recording it. Campaign ledger starts empty.

## Schedules

| Workflow | UTC schedule | Behavior |
|---|---|---|
| Scout and Builder | Existing six-hour schedule | Preserved |
| Verified revenue report | Existing daily 07:43 | Preserved |
| Marketer and growth review | Daily 08:17 | RSS research, one gated draft, aggregate report, checkout monitor; Monday snapshot adds weekly report |
| Transactional email retries | Hourly at :27 | Authenticated queue flush; honest `not_configured` while email disabled |

GitHub scheduled workflows can be delayed and follow repository default-branch/scheduling policies. They do not guarantee exact delivery times. A failure preserves prior verified metrics and exits visibly. None can send marketing messages, publish content, or submit a payment.

## Maintenance

Run Python unit tests from the repository root and `node --test commerce/tests/commerce.test.mjs`. Type-check and build the Sites source with its locked dependencies. Migrations 0001–0003 append schema; the original deployed migration remains unchanged. Store `CUSTOMER_DATA_KEY` and `JOB_TOKEN` as Site secrets; the job token also lives in GitHub's encrypted `COMMERCE_JOB_TOKEN`. The job credential cannot read reports, upload products or access customers. The report credential cannot flush email or upload products. Never rotate the customer encryption key without a deliberate re-encryption plan.
