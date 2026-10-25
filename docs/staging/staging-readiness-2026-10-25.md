# Staging readiness — integration/step-68 at STEP 70 (2026-10-25)

This is a readiness report, not a deployment authorization. Nothing here was deployed, pushed,
merged or migrated on a real server.

## Verdict: **NOT READY FOR STAGING**

Everything built in STEP 69–70 is complete and passes its tests. The branch cannot reach
staging through the protected flow yet:

1. **CI's Flutter job, a required check on `staging`, would fail.** Branch protection (spec
   §24.2) requires 3 status checks with `enforce_admins` on. Six Flutter tests already failed on
   `dev` `9fe61f3`, before this work, and they still fail. Four of them need decisions outside
   this task:

   | Test | Failure | Needs |
   |---|---|---|
   | `character_art_test` | art numbers 40, 42, 44 are undocumented gaps | art decision: retire them or add the files (never renumber) |
   | `character_art_placement_test` | «الأقسام» header art reaches the status bar | geometry; the separate `ui/kurdish-geometry-*` work is not in `dev` |
   | `empty_states_centered_test` | the empty collection layout | the same geometry work |
   | `responsive_layout_test` | `AnimePrimaryButton` overflows on a small phone | the same geometry work |
   | `sorani_review_queue_test` ×2 | six gift/discount keys lack queue entries; three entries are stale | review-queue bookkeeping, owner's call |

   This session cleared the other CI blocker in that job: `flutter analyze` had 4 issues and
   now reports none.
2. **Staging infrastructure is not provisioned** (README §10): database, API host, real DNS,
   secrets, and an Android build verified with a JDK. This needs a person with server and
   credentials access.
3. **CI has never run green on this branch.** The new commits are local. The first push after
   your OK is also the first CI run.

**Becomes "READY WITH DOCUMENTED NON-BLOCKING LIMITATIONS" when** the six Flutter tests are
resolved (or the required checks changed by the owner), CI is green on the pushed branch, and the
staging host and database exist per deploy §2–§5.

## Test evidence (this session, this machine)

| Layer | Command | Exit | Result |
|---|---|---|---|
| Backend, full suite on an **empty** DB (CI conditions, migrations only, no seed) | `npx vitest run` (`TEST_DATABASE_URL`=throwaway `otaku_galaxy_ci`) | 1 | 2066 / 2067 passed, 0 skipped, 827 s. 1 intermittent failure, see below |
| Backend, intermittent `contract-closure` CA-17a | `vitest run tests/contract-closure.test.ts` ×3, `-t CA-17a` ×5 | 0 | 26/26 ×3, 2/2 ×5 |
| Backend, previously flaky pool safety | `vitest run tests/performance-audit.test.ts -t "pool safety"` ×3 | 0 | 7/7 ×3 |
| Backend, quote binding (flaked once on 2026-10-24) | `vitest run tests/checkout-quote-binding.test.ts` ×3 | 0 | 8/8 ×3 |
| Backend, typecheck | `npx tsc --noEmit` | 0 | clean |
| Migrations | chain on the empty DB | — | 001→085 applied; none added this session |
| Dashboard, tests | `npx vitest run` (twice) | 1 | 384/387 and 385/387. Every failure is in `ProductEditPage.test.tsx`; it is 22/22 in isolation ×2, and at the pre-change commit `939b20b` the same block fails (369/370). Pre-existing load flake, not in CI |
| Dashboard, typecheck, lint, build | `npx tsc -b` · `npx oxlint` · `npm run build:staging` | 0 · 0 · 0 | 8 lint warnings, none in files changed here |
| Web store | `vitest run` · `tsc --noEmit` · `eslint .` · `next build` | 0 · 0 · 0 · 0 | 51/51 |
| Web store e2e | `playwright test` | — | **not run** (needs live servers and a runner; covered by the real-browser pass below) |
| Flutter, analyze | `flutter analyze` | 0 | no issues (was 4, all fixed in test files) |
| Flutter, tests | `flutter test --exclude-tags integration` | 1 | 2025 / 2031 passed, 0 skipped, 6 failed. Those six are exactly the set from before this work (table above). The first run had 8: two Sorani-queue count checks this work moved, now fixed |
| Flutter, integration | `--tags integration` | — | **not run** (needs a live API on :4000) |

**Mutation checks** (fix reverted → its test went red → source restored, sha256-checked).
Backend: revision check, Play-link check, audit outside the transaction, minimum > latest,
`no-store`, optional mode blocking (6/6 killed). Flutter: router remount, no retry, dismissal not
persisted, any-https link, prompt over a block (5/5 killed).

**CA-17a (backend, intermittent).** `waitForBlocked(1)` counts any lock waiter in the database. If
an unrelated session is waiting, the racing subscription is released before the rejection writes
stock, and it legitimately sees stock 0. The restock code was not changed in this session.
Hardening suggestion: wait for the specific waiter, as `admin-push-session.test.ts`
`waitForLockWaiter` does. Impact: an occasional red backend CI run; re-running clears it.

## Browser verification (real browser, local throwaway stack)

**Stack:**

- API `127.0.0.1:4100` on the database `otaku_galaxy_browse`, inside the throwaway container
  `og-step68`;
- dashboard `127.0.0.1:5180` (Vite dev);
- web store `127.0.0.1:3100` (`next dev`);
- test accounts created in this session only.

No staging or production system was contacted.

**Dashboard, «تحديث التطبيق»:**

- Validation errors appeared and nothing was sent, for:
  - a non-Play link, «الرابط ليس صفحة تطبيقنا على Google Play»;
  - minimum 1.3.0 above latest 1.2.0, «أعلى من أحدث إصدار».
- A mandatory publish showed the danger confirmation. The API read-back was
  `updateMode: mandatory`, min 1.1.0, latest 1.2.0, the canonical link with `&hl=ar` dropped,
  revision 1, and an audit row naming the admin.
- `X-App-Version: 1.0.0` returned **426** with the Play link; 1.1.0 passed the gate.
- «إيقاف السياسة» gave `updateMode: none`, and 1.0.0 was no longer blocked.
- «استعادة هذه القيم» filled the form without saving (the revision stayed 2).
- **Two tabs:** tab B published optional (revision 3). Tab A, on stale revision 2, got the 409
  message, reloaded to revision 3, and nothing was overwritten.
- **Layout** at 375 / 768 / 1440 px: `scrollWidth` equals the viewport, so there is no horizontal
  scroll. At 375 px the rollback button crowded the card title; it was **fixed in `30277d9`** and
  re-checked.
- **Console:** no errors besides the deliberate 409 and antd 6 deprecation warnings that the
  rest of the dashboard shares.

**Dashboard, products:**

- Product 4,000 with pair 7,000: the line read «قطعتان 7,000 (توفير 1,000) · ٣ قطع 11,000», and
  the new installed-app warning showed under «سعر قطعتين». It saved with `price 4000`,
  `pair_price 7000`.
- «السعر يُعلن لاحقاً» hid the price and disabled the pair price, and saved `price NULL` (not 0).
- The list showed «يُعلن لاحقاً» and «قطعتان بـ7,000 د.ع». Saving without a category was refused
  («اختر القسم»).

**Web store:**

- The pair product page read «قطعتان بـ7000 د.ع بدل 8000 د.ع — ولو اختلف الخيار».
- The unpriced page read «قريباً — السعر يُعلن لاحقاً», with no add-to-cart button and no
  «0 د.ع».
- The full shopper flow worked: register on the web store, then approve in «طلبات الحساب» (with
  the WhatsApp-check confirmation), then log in.
- **Cart:** 1 → 4,000; 2 → 7,000 «عرض قطعتين»; 3 → 11,000.
- **Checkout quote:** 11,000 + delivery 5,000 = 16,000. A wrong phone was refused with a clear
  error.
- **Order:** saved as products 11,000, total 16,000, line 11,000 with a pair snapshot of 7,000.
  Stock stayed 10 until approval, as the business rule says.
- **Dashboard order detail:** 3 × 4,000 = 11,000 «عرض قطعتين», final 16,000.

**API:** the unpriced product is `NOT_FOUND` for an installed app (no `X-OG-Unpriced`), and
`price: null` for the web store and dashboard.

**Not verified in a browser or on a device:**

- the Flutter app UI (no device or emulator here; widget tests only);
- the real Google Play listing and intent;
- web-store screens other than those above.

## Feature status

| Feature | Status | Evidence |
|---|---|---|
| A — unpriced products | complete | `unpriced-products` 10/10; browser checks above |
| B — pair price | complete. 1..6 = 4,000 / 7,000 / 11,000 / 14,000 / 18,000 / 21,000; birthday discount on the pair total; stock, idempotency and concurrency covered | `pair-price` 18/18 |
| B — installed apps | **decided: minimum-version gate.** The server cannot fix the old display (spec §70.3). The release order is in deploy §14, with a warning in the product form | `pair-price` «تطبيق 1.0.0…» 4 tests |
| App update policy | complete. Publish, optional/mandatory, Play-only link, revision, audit, rollback, history; prompt and gate in the app | `app-update-policy` 21, `app-version` 29, `AppUpdatesPage` 18, `app_update_policy_test` 21, force-update 41 |

## Infrastructure and deployment (inspected, not executed)

| Area | Finding | Evidence |
|---|---|---|
| Docker isolation | `IMAGE_TAG`, `ENV_FILE` and `HOST_PORT` have no defaults (`${VAR:?}`). `uploads` is project-scoped under `-p otaku-staging` / `-p otaku-prod`. The API binds 127.0.0.1 only | `docker-compose.yml:34,40,60`; `deploy-runbook.test.ts` 13/13 |
| PM2 isolation | Separate `cwd` (`/srv/otaku-galaxy-staging` vs `/srv/otaku-galaxy`), names and ports | `deploy/pm2/ecosystem.config.cjs` |
| Runbook blocks | Every `( set -e` block does `cd /srv/…`, then checks its branch | guard test |
| nginx/TLS | Certificate before enabling; reload only after `nginx -t`; failure restores the previous config | guard test; deploy §4–§5 |
| API URLs | Staging flavor and the dashboard's staging example → `staging-api.otakugalaxystore.com`. The web store needs `API_INTERNAL_URL` in production. No staging → prod fallback. The prod flavor still uses the placeholder `api.otaku-galaxy.example` (production item, README §10) | `lib/core/config/app_config.dart:61,68`; `web-store/src/lib/config.test.ts` |
| Secrets | Only `.env*.example` templates are tracked. Browser-check secrets were generated into a mode-600 scratchpad file | `git ls-files` |
| Migrations | None added in STEP 70. 084/085 rollbacks are transactional (deploy §14) | full backend run |
| Backup/recovery | No backup or restore plan exists (README §10, production list) | — |

## Security review (this session's diff, `c04064f..HEAD`)

- **Authorization:** both policy routes stay behind «الإعدادات». A sub-admin without it gets 403
  on read and write, and a customer gets 403. Tests cover both, plus the authz matrix.
- **Validation:**
  - a strict body;
  - semver;
  - a Play link limited to our package ids;
  - minimum ≤ latest;
  - the general settings route cannot write policy keys (regression test).
- **Unsafe URLs:** the server, the app (`trustedStoreUrl`), the dashboard and the web store
  accept only https Play pages for our ids. `market:`, `intent:`, `javascript:`, look-alike
  hosts, userinfo and ports are rejected.
- **Lockout risk:**
  - in doubt, nothing blocks;
  - a block is never automatic and is always confirmed;
  - minimum ≤ latest;
  - rollback never fails validation;
  - a first offline launch is never blocked;
  - a known block survives restart.
- **Audit:** inside the transaction, with a full snapshot and no secrets (`scrubSecrets`).
- **Logging and secrets:** nothing new is logged. No SQL is built by string interpolation.
- **Caching:** `no-store` on the public policy; a per-process 30 s cache, cleared on save.

No critical or high finding is open.

## Manual steps (need a person, credentials or a device)

1. Push the local commits and open the PR flow `dev → staging` (owner's OK; nothing pushed).
2. Resolve or decide the six Flutter tests above.
3. Provision staging: database, host, DNS, TLS and secrets (deploy §2–§5, R-17 blocks). Then run
   migrations 083→085 there through the §2/§3 step.
4. Build the pair-aware app above 1.0.0, publish it on Google Play and verify it on a device.
   Then publish the mandatory minimum from «تحديث التطبيق» (deploy §14–§15). Only after that,
   set pair prices in production.
5. On staging, walk the deploy §14 checks and the §15 workflow (publish → device sees the screen →
   «إيقاف السياسة» → device released).
