# Session handoff — 2026-10-25 (integration/step-68, STEP 70 → STEP 71)

Continues [session-handoff-2026-10-24.md](session-handoff-2026-10-24.md).

## Current state (STEP 71, later on 2026-10-25) — read this first

- **Worktree:** `/home/ameer/otaku_galaxy/.claude/worktrees/step-68-integration`.
- **Branch:** `integration/step-68`. `origin/integration/step-68` = `e0a3ddc` (the STEP 70 work
  below was pushed on your request). STEP 71 added **9 local commits, not pushed**
  (`git log e0a3ddc..integration/step-68`). No PR, no merge. `origin/dev`/`staging`/`prod` =
  `d3fd23c`/`73a2736`/`64c09bb`, unchanged; local `dev` `e3def17`, unchanged.
- **Readiness:** [staging-readiness-2026-10-25.md](staging/staging-readiness-2026-10-25.md),
  "STEP 71 update". **Verdict: NOT READY FOR STAGING** — no staging environment, CI never run on
  these commits, two staging hosts undecided. Code-side checks all pass.
- **Done in STEP 71:**
  - the six Flutter failures fixed by porting the owner-approved fixes that never reached `dev`
    (`376288f`, `cfd04b0`, `3c27b6c` from `release/rc-pre-staging`; `9dd52de` from
    `ui/kurdish-geometry-gates`; `1fe4c79` Sorani queue 533 → 536). Flutter 2035/2035;
  - pair price re-verified against 1.0.0's code; new gate limit documented (header-less
    pre-STEP 64 builds pass the gate) in deploy §14 and spec §70.3;
  - `backend/.env.staging.example` staging API host fixed + `env-templates.test.ts` guard (`77e1ad7`);
  - backend tests: lock-order plan check accepts both id-ordered plans; perf purge hook budget
    120 → 300 s (`7dbde63`). Final full run 2069/2069 on a fresh DB;
  - README §10 stale rows corrected.
- **Needs you:**
  1. OK to push the 7 commits; then the `dev` merge or a PR to `staging` so CI runs.
  2. Decide the staging dashboard host and the staging web-store host.
  3. Provision staging (server, DB, DNS/TLS, secrets) — deploy §0–§5.
  4. Before any production pair price: Play build from STEP 64+ code above 1.0.0 → mandatory
     minimum (deploy §14–§15); confirm no older build is distributed.
  5. Optional: make the web-store CI job a required check; `agentRules: false` for `next dev`.
- **Known flake, not fixed:** dashboard `ProductEditPage` (3 tests wait for the post-save
  navigation; full-suite load only; 12/12 isolated 3×-parallel runs pass; dashboard CI runs no
  vitest). A longer wait budget was tried and reverted — not proven.
- **Throwaway DB:** container `og-step71` (postgres:16-alpine, 127.0.0.1:55471, password in this
  session's scratchpad). `docker stop og-step71` removes it.

---

## Earlier: STEP 70 (the state below is history; the push and Git lines are superseded above)

## Done (committed here)

- **`ceda7bc` cherry-picked.** This fixes a gate race: a 426 that arrives during an in-flight
  check is no longer lost.
- **App update policy (STEP 70).** Backend, the «تحديث التطبيق» dashboard page and the app. The
  owner chose to add «أحدث إصدار» and optional/mandatory to the STEP 64 fields, with no custom
  message and no build codes.
  - The link is our Google Play page only.
  - Publishing is atomic, revision-checked and audited.
  - `{enabled:false}` (rollback) always succeeds.
  - The optional prompt floats over the live app, once per version.
  - Offline checks retry with backoff.
  - Deploy §15 has the administrator steps.
- **Pair price vs installed apps.** The server-side fix is not possible (the evidence is in spec
  §70.3 and `pair-price.test.ts`), so the minimum-version gate applies. The release order is in
  deploy §14, and a warning sits beside «سعر قطعتين».
- **Product detail.** The app shows «قطعتان بـ{price}».
- **CI hygiene.** `flutter analyze` now reports no issues; the four issues in test files are
  fixed. The Sorani queue counts follow the new keys (528 → 533).
- **Tests added** for:
  - the 1..6 pair table;
  - the birthday discount on the pair total;
  - the old-client contract;
  - the gate and its rollback.
- **Browser-checked on a throwaway local stack:**
  - the dashboard: product form (priced, pair, unpriced), app updates (validation, publish,
    426, rollback, restore, concurrent-edit 409, 375/768/1440 px);
  - the web store: product pages, then register → approve → login → cart 1/2/3 → checkout →
    order, with the totals matching the database.

## Open — needs the owner

1. **Push** this branch's new local commits when you are ready. Nothing was pushed.
2. **The six pre-existing Flutter failures** (readiness report table):
   - character art 40/42/44 gaps;
   - three geometry tests, which the Kurdish-geometry branch addresses;
   - Sorani queue drift ×2.

   CI's required Flutter check stays red until these are resolved.
3. **The pair-aware release.** Build it above `1.0.0`, publish it on Play, then publish a mandatory
   minimum. Only after that, set pair prices in production (deploy §14).
4. **`next dev` agent files.** `agentRules: false` in `web-store/next.config` is still your call. I
   deleted the copies my run created.
5. **Release flow:** `integration/step-68` → `dev` → `staging` → `prod`, as usual.

## Not done or not verified

- **Flutter UI on a real device or emulator.** None is available here, so the optional prompt,
  the store intent and the pair label are covered by widget tests only.
- **The real Google Play workflow.** No Play Console access and no device: the Play intent and
  listing were never opened.
- **Anything on a real server:** the staging runbook, §13, migrations 083–085 and the §15
  workflow.
- **Flaky, not caused here:**
  - backend `contract-closure` CA-17a: 1 of 9 runs, with a non-specific lock-count barrier;
  - dashboard `ProductEditPage`: under load, also at the pre-change commit, and not in CI.

## Environment

- **Throwaway Postgres `og-step68` on 127.0.0.1:55468.** It holds `otaku_galaxy_test`,
  `otaku_galaxy_ci` (the empty-DB suite) and `otaku_galaxy_browse` (the browser check, with test
  accounts only). `docker stop og-step68` removes all of it.
- **Browser-check env and logs** are in this session's scratchpad (`browse/`). The test credentials
  live there, mode 600, and never entered Git. Nothing was added to `.claude/launch.json`, and all
  dev servers are stopped.
