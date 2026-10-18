# BUILT 4 GOD AI

## Phase 2 commerce

The LaunchReady storefront, verified Stripe webhook handler, private file delivery, refund revocation, and daily aggregate revenue reporting are implemented under `commerce/`. Read [commerce operations](commerce/OPERATIONS.md) for the exact deployment state, required Stripe configuration, and tests. Storefront: https://built4god-launchready.wearebuilt4god.chatgpt.site. Payment acceptance remains closed until the existing Stripe account is reconnected and its Payment Link and webhook are configured. No verified sales are claimed.

**Built With Purpose. Powered by Intelligence. Guided by Faith.**

Biblical foundation: Proverbs 16:3 and Matthew 25:14–30.

An evidence-led research and product drafting engine using Python 3.12 and SQLite. No packages, subscriptions, hosting account, API key, or paid model is required. This first version uses deterministic ranking and templates; it does not contain a language model or guarantee income.

## Run locally

```sh
python -m unittest discover -s tests -v
python -m built4god run
python -m built4god report
```

Scout reads the two explicit public RSS endpoints in `built4god/engine.py`. It does not scrape linked pages. It bounds feed sizes and network timeouts, rejects undated/stale/future entries, normalizes tracking URLs, stores evidence in SQLite, and isolates source failures. Reports identify failed sources. All-source failure exits unsuccessfully after saving a report. Read current source terms before adding or changing connectors; RSS availability alone is not permission for other uses.

Signals expire from rankings after 30 days. Categories are research hypotheses, not verified gaps in the market. Five 1–5 dimensions plus a capped signal count produce priority out of 30. Competition and revenue remain explicitly unverified and score conservatively. Scores are not financial forecasts.

Builder selects the highest-ranked category without an existing draft and creates an original CSV tracker, practical guide, and provenance manifest. At most one draft is created per run. These are starter templates requiring niche examples, usability review and buyer validation. No content from linked articles is copied into the products. Drafts are never automatically listed or sold.

## GitHub deployment

The active workflow is `.github/workflows/scout.yml`. It runs at minute 17 every six hours UTC and supports **Actions → Scout and Builder → Run workflow**. Scheduled workflows use the default branch. Runs can be delayed or disabled by GitHub; this is not a precise execution guarantee.

Each run tests first, researches, drafts, commits `data/` and `output/` to main, and uploads reports/products as an artifact. Repository commits preserve SQLite history independently of expiring artifacts. A concurrency group serializes scheduled/manual runs. If branch protection blocks bot commits, the workflow fails visibly and still attempts an artifact upload; configure an allowed state branch before relying on unattended persistence. Do not enable paid runner capacity. This lightweight Linux workflow is intended for GitHub's free public-repository runner allowance; account policy and future pricing can change.

**This repository is public.** Its scheduled database must contain public research only. Do not put customer details, credentials, or private sales records in it. Use a separate ignored directory for revenue:

```sh
python -m built4god --data-dir private --output-dir private/reports record-sale --reference actual-payment-reference --product product-name --amount-cents 900 --currency USD
python -m built4god --data-dir private --output-dir private/reports report
```

Record only completed real payments. Unique references prevent duplicate entries; currencies total separately. This Phase 1 manual ledger is separate from Phase 2's verified webhook ledger. Neither is complete accounting or recurring billing. There are no seeded sales or fabricated earnings.

## First-sale operating plan

1. Inspect `output/reports/latest.md` and the corresponding evidence links.
2. Choose a buyer you can reach through an existing relationship or a community that permits product research. Ask about a specific repeated problem; avoid unsolicited mass outreach.
3. Customize and test a draft against that problem. Get consent-based feedback from prospective buyers before calling it validated.
4. Select a permitted no-upfront-fee selling channel and review its transaction fees, identity requirements, delivery rules and refund policy. No seller account or payment channel is configured here.
5. Publish a truthful listing after reviewing the finished files. Record an actual completed sale in the private ledger.
6. Consider recurring delivery only after buyers show repeat demand and you can support updates. No subscription revenue is assumed.

No survey automation, fake engagement, mass messaging, purchases, affiliate enrollment or platform-rule bypass is implemented. External content is untrusted evidence and never executed. Product publication and commercial terms remain owner decisions.

## Current limits

Two broad technology RSS sources provide weak demand signals. Niche discovery, competition assessment and willingness to pay need stronger authorized sources and buyer research. The three starter product categories intentionally limit automated output. Phase 2 adds a hosted storefront, verified revenue ingestion, refund revocation, and protected downloads; those features require the Stripe configuration documented in `commerce/OPERATIONS.md`. Subscriptions are not implemented. A legitimate first sale still requires buyer demand and live payment setup.
