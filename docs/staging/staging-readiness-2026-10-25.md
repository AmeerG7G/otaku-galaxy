# Staging readiness — integration/step-68 at STEP 71 (2026-10-25)

This is a readiness report, not a deployment authorization. Nothing here was deployed, pushed,
merged or migrated on a real server.

## STEP 71 update (later on 2026-10-25) — current state

### Verdict: **NOT READY FOR STAGING**

The code is ready to enter the `dev → staging` flow: every local check now passes, including
the Flutter job that blocked the required CI check. What still blocks staging needs you or a
server, not code:

1. **No staging environment exists** — server, PostgreSQL database, DNS, TLS, secrets
   (deploy §10). Nothing can be deployed or verified on staging until it does.
2. **CI has never run on any commit after `e0a3ddc`'s base.** CI triggers only on pushes to
   `dev`/`staging`/`prod` and PRs to `staging`/`prod`; pushing `integration/step-68` runs
   nothing. The last CI run is `origin/dev` `d3fd23c`, green, 2026-09-30.
3. **Decisions:** the staging dashboard host (`CORS_ORIGINS`) and the staging web-store host
   (`SITE_ORIGIN`) are not decided anywhere; only `staging-api.otakugalaxystore.com` is.

**Becomes READY FOR STAGING when:** the commits are pushed with your OK and merged into `dev`
(or a PR to `staging` is opened) and CI is green there, and the staging host and database exist
per deploy §2–§5 with the hosts in item 3 decided.

### Git state

| Ref | Commit | Changed this session |
|---|---|---|
| local `integration/step-68` | `HEAD` (see `git log e0a3ddc..`) | 9 local commits (8 fixes/tests + this docs commit), **not pushed** |
| `origin/integration/step-68` | `e0a3ddc` | no |
| `origin/dev` · `origin/staging` · `origin/prod` | `d3fd23c` · `73a2736` · `64c09bb` | no |
| local `dev` · `staging` · `prod` | `e3def17` · `73a2736` · `64c09bb` | no |

Branch protection (read with `gh api`, not changed): `staging` and `prod` require
`Backend (typecheck + tests)`, `Admin dashboard (typecheck + build)`, `Flutter (analyze + test)`,
strict. The `Web store` job runs in CI but is **not** a required check (owner setting).

### The six Flutter failures — causes and fixes

| Test | Exact cause | Since | Fix |
|---|---|---|---|
| `character_art_test` (gaps) | `assets/art/characters/` has 41/43/45 but nothing documents 40/42/44. Those three files were never committed on any ref; 40 and 42 existed only untracked on 2026-10-04 and were different artworks | `a80ff21`/`46fec50`/`cbefc7d` (2026-10-04) | `376288f` = `e18f07a` (owner decision 2026-10-10: unrecoverable → documented as retired) |
| `character_art_placement_test` «الأقسام» | `a83fdf9` moved the Categories art below the status bar, contradicting spec §63.2 (art extends into the status-bar region on this screen) | `a83fdf9` (2026-10-04) | `cfd04b0` = `220ffe8` (`top: 0`; the title stays under the header's SafeArea; owner decision 2026-10-10). `categories_header_layout_test` now asserts the documented rule; its "art extends below the header" check holds at 390/412 px, not 360 px (art ends 3 px short there, unclipped) |
| `empty_states_centered_test` (collection) | `d29150a` deleted `38.png` and the empty-collection artwork; the test requires art → text → button | `d29150a` (2026-10-04) | `3c27b6c` = `4672296` (owner decision 2026-10-10: restore the exact blob) |
| `responsive_layout_test` `AnimePrimaryButton` small phone | Gate 4 (`9fe61f3`) made the label a one-line `BoundedText`; a label that cannot fit one line at the 0.8 floor is reported instead of wrapping in the 52 px button | `9fe61f3` (2026-10-10) | `9dd52de` = `363b7b8` (geometry branch, 2026-10-12): a second centred line only inside the fixed height. Conflict resolved by taking only the height cap; mutation (maxLines 1) re-fails the test |
| `sorani_review_queue_test` ×2 | `4a8d2c8` added six keys and dropped three without touching the queue | `4a8d2c8` | `1fe4c79` (port of `2716272`): queue 533 → 536, new entries HIGH / NOT_REVIEWED / NEEDS_NATIVE_REVIEW, `native_approved_count` 0, md regenerated (`--check` passes) |

All five fixes already existed as owner-approved commits on two local branches that never
reached `dev` (`release/rc-pre-staging`, `ui/kurdish-geometry-gates`). None of the six was
caused by STEP 69–70. No assertion was removed; the one test whose expectations changed
(`categories_header_layout_test`) follows the documented rule.

### Pair price and app 1.0.0 — re-verified

**1.0.0 cannot show 7,000 without an update.** Checked in its code (`e3def17`):
`product.price` = `unitPrice` (`cart_repository_impl.dart:94`); every total is
`product.price × quantity` (`cart_item.dart:18`, `cart_screen.dart:326`, order data/review/detail);
`lineTotal` from the server is never read; `expectedPrices` echoes `unitPrice`
(`order_data.dart:78`). `pair-price.test.ts` pins each fact (4 tests, pass). The minimum-version
gate stays the path (deploy §14). The new app's display goes only through the server line total
(`cart_item.dart:26`, `pair_price_line_total_test.dart`), and it sends `X-App-Version` from the
platform `versionName`, so `--build-name=1.1.0` reaches the gate.

**New finding — the gate's limit.** An absent `X-App-Version` passes by design. App code on
`origin/prod` and `origin/staging` (pre-STEP 64) never sends it, so a build from either cannot be
gated. Those builds point at `.example` hosts and cannot reach a real server today. Added to
deploy §14 and spec §70.3: the Play build must come from STEP 64+ code, and no production pair
price while an older build is distributed (only the Play account owner knows). Pair pricing was
not activated anywhere.

### Staging prerequisites — complete list

| # | Prerequisite | Status | Who |
|---|---|---|---|
| 1 | Server/VPS, nginx ≥ 1.25.1, Docker or PM2 (deploy §0–§3) | missing | owner / server access |
| 2 | Empty staging PostgreSQL, `DATABASE_URL` separate from prod | missing | server |
| 3 | DNS `staging-api.otakugalaxystore.com` + TLS (certbot) | missing (host decided, never resolved/verified) | owner |
| 4 | `backend/.env.staging` real values: `JWT_SECRET`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `TRUST_PROXY`, `BFF_SHARED_SECRET` | missing | server |
| 5 | Staging dashboard host → `CORS_ORIGINS`; no nginx/serve step for the built dashboard in the runbook | **undecided / undocumented** | owner decision, then runbook |
| 6 | Staging web-store host → `SITE_ORIGIN`; `deploy/nginx` has no web-store file; §13 stays «لا تُشغَّل» | **undecided / missing** | owner decision, then runbook |
| 7 | Migrations 001→085 on the empty DB, then the first admin (`ALLOW_PRODUCTION_SEED`, `SEED_ADMIN_*`) | not run | server |
| 8 | Firebase staging project (`FCM_*`, `VITE_FIREBASE_*`, dart-defines) | optional — push reports «غير مُعدّ» without it | owner |
| 9 | Backups and monitoring | none | owner |
| 10 | CI green on these commits (push approval, then `dev` push or PR to `staging`) | never run | owner |
| 11 | Android staging build | see "Test evidence" below | — |
| 12 | Web-store check as a required status check | not required today | owner (GitHub setting) |

Fixed locally this session: `backend/.env.staging.example` `PUBLIC_BASE_URL` still named
`staging-api.otaku-galaxy.example` while the app and dashboard use
`staging-api.otakugalaxystore.com` (`77e1ad7`, guarded by `backend/tests/env-templates.test.ts`).
README §10 rows that were stale (Firebase "not used", hostnames, CI) were corrected.

### Test evidence (this session, this machine)

All on this machine. Backend runs use a throwaway `postgres:16-alpine` container (`og-step71`,
127.0.0.1:55471), a **fresh empty** database per full run, migrations only, no seed (CI
conditions). Nothing contacted staging or production.

| Layer | Command | Exit | Pass / fail / skip |
|---|---|---|---|
| Flutter analyze | `flutter analyze` | 0 | no issues |
| Flutter tests | `flutter test --exclude-tags integration` (JSON reporter) | 0 | **2035 / 0 / 0** (was 2025 / 6 / 0 at `e0a3ddc`) |
| Flutter, targeted after the fixes | the 5 failing files + l10n/geometry/bounded suites | 0 | 556 / 0 / 0 and 459 / 0 / 0 |
| Flutter integration | `--tags integration` | — | **not run** (needs a live API on :4000) |
| Android staging build | `flutter build apk --flavor staging -t lib/main_staging.dart --release` | 0 | `app-staging-release.apk` 75.2 MB; `com.otakugalaxy.otaku_galaxy.staging`, `1.0.0-staging`; only `staging-api.otakugalaxystore.com` compiled in; **debug-signed** (Play signing is a production item). Not installed on a device |
| Backend typecheck | `npm run typecheck` | 0 | clean |
| Backend full, run 1 | `npx vitest run` | 1 | 2068 / 1 / 0 — lock-order plan test (statistics-dependent plan shape) → fixed `test(backend): lock-order…` |
| Backend full, run 2 | `npx vitest run` (fresh DB) | 1 | 2064 / 5 / 0 — perf purge hook > 120 s, then 5 pool checks saw its busy client → fixed `7dbde63` (hook budget only) |
| Backend full, run 3 | `vitest run` (fresh DB) | 1 | 2043 / 17 / 9 — **environmental, discarded**: 5.1 of 8 GB swap in use (7 GB RAM, desktop apps plus my idle Gradle daemon). `performance-audit`'s 180 s seed hook timed out and its year-of-trading rows then broke 10 later list/count tests. (An earlier attempt ran from the repo root with an unrelated `npx` vitest 5 and is not counted; the 15 upload files it wrote to a new root `uploads/` were removed) |
| **Backend full, run 4 (final)** | `node_modules/.bin/vitest run` in `backend/` (fresh DB, Gradle daemon stopped) | **0** | **2069 / 0 / 0**, 122 files, 798 s |
| Backend, targeted | `order-concurrency-audit` · `performance-audit` · `env-templates` alone | 0 · 0 · 0 | 35/35 · 23/23 · 2/2 |
| Dashboard | `npx tsc -b` · `npx oxlint` · `npx vite build --mode prod` (CI) · `npm run build:staging` | 0 · 0 · 0 · 0 | lint warnings only |
| Dashboard tests | `npx vitest run` ×3 (not in CI) | 1 · 1 · 0 | 384/3/0 · 386/1/0 · 387/0/0 — only `ProductEditPage` post-save navigation waits; 12/12 file runs pass 3× in parallel. **Pre-existing load flake, not fixed** (a longer wait was tried, not proven, reverted). The second and third runs had that change; the first did not |
| Web store | `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` | 0 · 0 · 0 · 0 | 51 / 0 / 0 |
| Web store e2e | `playwright test` | — | **not run** (needs live servers) |

**Regressions vs pre-existing:** no regression from STEP 69–71 code was found. Every failure
above predates this session (Flutter six: 2026-10-04..10; dashboard flake: present at `939b20b`)
or is a test-environment timing/plan issue in a test file (backend runs 1–2), fixed without
changing an assertion's meaning. Residual risk for CI: `performance-audit` is the suite's
heaviest file; on a starved runner a timed-out seed leaves its dataset behind and cascades into
other files (run 3). GitHub's runners have more headroom than this machine; if CI shows that
pattern, the fix is a statement timeout on the seed, not more retries.

---

## Earlier on 2026-10-25 (STEP 70) — superseded where the section above differs

### Verdict at that time: NOT READY FOR STAGING

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
