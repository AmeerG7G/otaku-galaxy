# Session handoff — 2026-10-24 (integration/step-68)

- **Worktree:** `/home/ameer/otaku_galaxy/.claude/worktrees/step-68-integration`.
- **Branch:** `integration/step-68`, pushed at the owner's request as its own branch,
  `origin/integration/step-68`. There is no PR and no merge, and `origin/dev`, `staging` and
  `prod` are untouched.
- **Base:** local `dev` @ `e3def17`. Its 56 commits used to exist only on this machine; they now
  also exist on GitHub as ancestors of that branch.
- **Spec:** STEP 69 in `PROJECT_FEATURE_SPEC.md` holds the full record.

## Done (committed here)
- **Recovery.** Both cloud branches are merged in:
  - `origin/claude/clever-brown-b00tod` @ `4bfaefb`;
  - `origin/claude/compassionate-mayer-61v1pc` @ `25d1fb0`.

  Migration 071 became 083, and the cloud spec's «STEP 67» became STEP 68. Two merge problems were
  fixed: `withIdempotencyKey` dropped `loyaltyGiftActivated`, and an antd test was already red on
  the cloud branch. Not recoverable anywhere: the cloud's `744767a`, its STEP 68, its
  `session-handoff.md`, and the old deploy §12.
- **R-17, runbook isolation.** Details are in `deploy/README.md`. The static guard
  `backend/tests/deploy-runbook.test.ts` catches 20 of 20 mutations. §13, the web store on
  staging, stays «لا تُشغَّل».
- **Feature A, «قريباً — السعر يُعلن لاحقاً»** (migration 084): across the backend, dashboard and
  web store.
- **Feature B, two-piece price** (migration 085): across the backend, dashboard and web store. The
  Flutter app shows the server's line totals.
- **Deploy notes:** `deploy/README.md` §14 covers 084–085, the release order, the app-version
  caveat and the rollback command (the guard-checked subshell form).
- **Independent review.** All four findings are fixed, each with a test shown red without its fix:
  - the app now sends the reviewed pair price in `expectedPrices`, and an offer change returns
    409 `PRODUCT_PRICE_CHANGED`;
  - the `084` and `085` rollbacks run in one transaction (the old `084.down` broke a database
    when run with plain `psql`; reproduced, then fixed);
  - no «عاد للتوفر» is sent while a product is unpriced; it goes out once when the price is
    announced;
  - the app's review screen treats `PRODUCT_NOT_PRICED` as a cart conflict.

## Open — needs the owner
1. **Installed apps and pair prices.** Current app releases compute cart lines as price × quantity,
   so they show 8,000 for a pair the server charges 7,000. They also do not send the reviewed pair
   price. Either raise «أدنى إصدار مدعوم» to the
   release that carries this session's Flutter change before setting any pair price in
   production, or accept the difference. This is UNRESOLVED and documented in deploy §14.
2. **`next dev` agent files.** Next 16's `next dev` writes `web-store/AGENTS.md` and `CLAUDE.md`
   on every run. I deleted the ones my run created. Setting `agentRules: false` in
   `next.config` would stop it; that is the owner's call.
3. **Merging and releasing:** `integration/step-68` → `dev` → `staging` → `prod`, through the normal
   flow.

## Not done or not verified
- **Not checked in a browser:**
  - the dashboard form and tables (covered by component tests only);
  - the web store's cart and checkout, which need a signed-in shopper (covered by API integration
    tests).
- Anything on a real server: the staging runbook, §13 and the migrations on staging.
- The Flutter app shows no «قطعتان بـ…» label yet; that needs new ar and ckb strings.
- Analytics does not report the pair-offer saving as a separate figure; gross sales are already
  net of it.

## Environment
- A throwaway database container `og-step68` runs on 127.0.0.1:55468 (`docker stop og-step68`
  removes it). It holds `otaku_galaxy_test`; the browse database has been dropped.
- The browser-check scripts are in the session scratchpad (`browse/`). Nothing was added to
  `.claude/launch.json`.
