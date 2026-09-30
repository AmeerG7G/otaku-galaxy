# Otaku Galaxy — مجرة الأوتاكو

Flutter storefront + Node/Express API + React admin dashboard, run across three
environments: **dev**, **staging**, **prod**.

> Feature-level behaviour and audit history live in
> [`PROJECT_FEATURE_SPEC.md`](PROJECT_FEATURE_SPEC.md). This file covers
> environments, branching and release.

**Status labels used throughout this document**

| | Meaning |
|---|---|
| ✅ IMPLEMENTED | built **and** verified in this repository |
| ⚠️ PARTIALLY IMPLEMENTED | configured but not fully verifiable here |
| ❌ NOT IMPLEMENTED | does not exist yet |
| 🔧 REQUIRES MANUAL SETUP | needs credentials, hardware or infrastructure |

Nothing is labelled ✅ on the strength of having been *requested*. Each ✅ below
corresponds to a command that was actually run — see §9.

---

## 0. Architecture

```
Flutter app  ─┐
              ├─▶  Backend / API (Node + Express)  ─▶  PostgreSQL
Admin dash.  ─┘
```

One backend serves both clients. One PostgreSQL database per environment.

```
dev      →  dev backend      →  dev database
staging  →  staging backend  →  staging database
prod     →  prod backend     →  prod database
```

Current reality: **only `dev` exists end to end.** The staging and production
backends and databases are 🔧 not provisioned — their configuration templates
exist, nothing is deployed.

---

## 1. What each environment means

| | `dev` | `staging` | `prod` |
|---|---|---|---|
| Purpose | day-to-day development | full-system testing before release | live customers |
| Data | throwaway | realistic, disposable | **real** |
| Secrets | fallbacks allowed | **required** | **required** |
| Account activation | admin approval (dashboard) | admin approval (dashboard) | admin approval (dashboard) |
| SMS / OTP | **none** — removed | **none** — removed | **none** — removed |
| Seeding | allowed | blocked unless forced | blocked unless forced |

**`staging` is hardened exactly like `prod`.** It is not "dev with a different
URL" — real people use it, so a missing or weak `JWT_SECRET`/`DATABASE_URL`
stops the server from starting, just as in production.

### Environment mapping

```
dev      →  dev backend      →  dev database
staging  →  staging backend  →  staging database
prod     →  prod backend     →  prod database
```

Nothing crosses. A dev or staging build must never reach the production
database.

---

## 2. Git branches ✅ IMPLEMENTED

```
dev  ──PR──▶  staging  ──PR──▶  prod
             (test here)        (release)
```

Exactly three long-lived branches: **`dev`**, **`staging`**, **`prod`**.
There is no `main`. `prod` is the production branch and the GitHub default.

`master` is kept only as a historical pointer to the pre-split history. Do not
develop on it.

### Pull requests

Git does not infer direction. A pull request states it explicitly:

```
base    = destination
compare = source
```

| Release step | base | compare | Means |
|---|---|---|---|
| Development → testing | `staging` | `dev` | move dev work into staging |
| Testing → production | `prod` | `staging` | release tested staging to production |

**`prod` is never the compare (source) branch.** If you find yourself opening a
PR with `compare: prod`, stop — you have the direction backwards.

Never merge `dev → prod` directly for a normal release.

### Release workflow

1. Build the feature on `dev`.
2. Commit and push `dev`.
3. Open a PR — **base `staging`, compare `dev`**.
4. Merge after review.
5. Test the whole system against staging.
6. Found a bug? Fix it **on `dev`**, then repeat from step 3.
7. When staging is approved, open a PR — **base `prod`, compare `staging`**.
8. Merge after final approval.
9. Build and deploy production.

---

## 3. Flutter ✅ IMPLEMENTED (entry points, config) · ⚠️ builds unverified

Three entry points, one application. Only the selected `AppConfig` differs —
there is no duplicated app code.

```
lib/main_dev.dart      → AppConfig.development
lib/main_staging.dart  → AppConfig.staging
lib/main_prod.dart     → AppConfig.production
lib/main_common.dart   → shared runner used by all three
lib/main.dart          → legacy entry, reads --dart-define=APP_ENV
```

### Run

```bash
flutter run --flavor dev     -t lib/main_dev.dart
flutter run --flavor staging -t lib/main_staging.dart
flutter run --flavor prod    -t lib/main_prod.dart
```

### Build ⚠️ CONFIGURED, NOT VERIFIED

```bash
flutter build apk       --flavor dev     -t lib/main_dev.dart
flutter build apk       --flavor staging -t lib/main_staging.dart
flutter build appbundle --flavor prod    -t lib/main_prod.dart
```

**No APK or AAB has been produced.** The development environment has a JRE but
no JDK (`javac` is absent), so Gradle stops at
`compileDevDebugJavaWithJavac`. What *was* verified is that Gradle configures the
flavors and generates every expected variant task — `assembleDevDebug`,
`assembleStagingDebug`, `assembleProdRelease` and `bundleProdRelease` all
resolve. Run these on a machine with a JDK to confirm. The same applies to
`flutter run --flavor …`, which additionally needs a device or emulator.

### Android application IDs ✅ IMPLEMENTED

| Flavor | Application ID | App name |
|---|---|---|
| `dev` | `com.otakugalaxy.otaku_galaxy.dev` | Otaku Galaxy DEV |
| `staging` | `com.otakugalaxy.otaku_galaxy.staging` | Otaku Galaxy STAGING |
| `prod` | `com.otakugalaxy.otaku_galaxy` | Otaku Galaxy |

**The production ID is unchanged and must stay that way** — changing it creates
a new Google Play listing and cuts off updates for existing installs. Only dev
and staging carry a suffix, so all three can sit on one device at once.

Cleartext HTTP is enabled for the **dev flavor only**
(`android/app/src/dev/AndroidManifest.xml`), because the dev backend runs on
plain HTTP at `10.0.2.2:4000`. Staging and production allow HTTPS only.

### Pointing at a different backend

```bash
flutter run --flavor dev -t lib/main_dev.dart \
  --dart-define=API_BASE_URL=http://192.168.1.50:4000/api
```

Needed for a real device on your LAN — `localhost` there is the phone itself.
The media origin follows the API base automatically.

---

## 4. Backend ✅ IMPLEMENTED (dev) · 🔧 staging/prod not deployed

One codebase, one config module, three environments.

```bash
cd backend
npm run dev            # APP_ENV=dev,     watch mode
npm run start:staging  # APP_ENV=staging, from dist/
npm run start:prod     # APP_ENV=prod,    from dist/

npm run db:migrate           # dev database
npm run db:migrate:staging   # staging database
npm run db:migrate:prod      # production database
```

`APP_ENV` selects the environment and its file. Loading order (first wins):

```
process environment  →  .env.<APP_ENV>  →  .env
```

so real deployment secrets can be injected as environment variables and never
touch disk.

### Environment files

| File | Committed | Purpose |
|---|---|---|
| `.env.example` | yes | original template |
| `.env.dev.example` | yes | dev template |
| `.env.staging.example` | yes | staging template |
| `.env.prod.example` | yes | production template |
| `.env`, `.env.dev`, `.env.staging`, `.env.prod` | **no** | real values |

Copy the template you need and fill it in:

```bash
cp backend/.env.staging.example backend/.env.staging
```

**Never commit a real environment file.** `.gitignore` excludes `.env` and
`.env.*` while allowing `*.example`.

---

## 5. Admin dashboard ✅ IMPLEMENTED

Uses Vite's built-in mode system — no second configuration layer.

```bash
cd admin
npm run dev            # dev backend
npm run dev:staging    # staging backend
npm run build:staging  # staging bundle
npm run build:prod     # production bundle (also `npm run build`)
```

Each mode reads `.env.<mode>`, which sets `VITE_API_BASE_URL` and
`VITE_APP_ENV`. Templates: `.env.dev.example`, `.env.staging.example`,
`.env.prod.example`.

The header shows a coloured **DEV** or **STAGING** badge. Production shows no
badge — if you see one, you are *not* looking at production data. The three
dashboards are visually identical otherwise, and that badge is the practical
guard against editing the wrong database.

---

## 6. Secrets

- Real secrets never enter Git. Templates carry variable *names* only.
- Production and staging secrets belong in the host's environment or a secret
  manager, not in a file in the repo.
- `JWT_SECRET` must be at least 32 characters and must not be a known
  placeholder; staging and production refuse to start otherwise.
- Rotating `JWT_SECRET` invalidates every existing session — intended.

---

## 7. Safety rules

**Never:**

- `git push --force` to `prod` (or `staging`).
- `git reset --hard` without knowing exactly what it discards.
- Merge `dev → prod` directly for a normal release.
- Point `dev` or `staging` at the production database.
- Commit an API key, password, token or `.env` file.
- Copy the project into three folders to represent environments.
- Run destructive operations or seeding against production data.
- Change the production `applicationId`.

**Always:**

- Release through `dev → staging → prod`.
- Test in staging before production.
- Check the admin header badge before making changes.

---

## 8. Order → delivery → rating lifecycle ✅ IMPLEMENTED

```
Customer → Cart → Order
                    ↓
            Admin processing
                    ↓
             OUT_FOR_DELIVERY        ← rating window is stamped here
                    ↓
         Delivery confirmation (customer)
                    ↓
   Rating becomes available at the server timestamp
                    ↓
          Customer submits rating
                    ↓
            Admin reviews rating
                    ↓
        Admin publishes / rejects it
```

Verified behaviour (each point is covered by a test in
`backend/tests/order-rating-lifecycle.test.ts` or `confirm-receipt.test.ts`):

- ✅ The **backend is the authority** for whether a delivery confirmation is
  pending. Nothing on the device decides it.
- ✅ `GET /orders/pending-confirmation` returns the **oldest eligible** order
  (status `OUT_FOR_DELIVERY`), or `null`.
- ✅ Confirming receipt **does not modify `rating_available_at`**. The window is
  stamped when the order goes out for delivery, not when the customer taps.
- ✅ Rating availability is computed **in SQL** from the stored timestamp
  (`rating_available_at IS NOT NULL AND rating_available_at <= now()`), so a
  device clock change cannot unlock it.
- ✅ **No hardcoded 24-hour gate exists in the Flutter rating path** — enforced
  by a source-scanning test in `test/rating_window_contract_test.dart`.
- ✅ The admin reminder endpoint updates `rating_available_at`, and both the
  scheduler and the customer API read that same column.
- ✅ Duplicate protection: manual "send now" and the scheduler write
  `rating_reminder_sent_at` in the same atomic statement, so only one reminder
  is ever sent.
- ✅ Eligibility (STEP 57, CA-16): the reminder goes only to an order that still
  has a reviewable product (`REVIEWABLE_ITEMS_OF_ORDER`, the same definition as
  `reviewableProductCount`). A fully reviewed order's reminder is withdrawn at its
  due time; "send now" answers `409 NOTHING_TO_REVIEW`.

### Database resilience ✅ IMPLEMENTED

`pg.Pool` now has an `'error'` listener. Without it, an idle connection being
dropped by PostgreSQL (failover, `pg_terminate_backend`, admin restart) raised
an unhandled `'error'` event and **killed the API process**, taking the rating
scheduler with it. The regression test in `backend/tests/db-resilience.test.ts`
was verified to **fail without the guard and pass with it**.


## 9. Testing — verified commands

Every command below was executed in this repository. Results are from the most
recent run.

| Command | Where | Result |
|---|---|---|
| `npx tsc --noEmit` | `backend/` | ✅ clean |
| `npx vitest run` | `backend/` | ✅ **281 passed** (22 files) |
| `npx tsc -b` | `admin/` | ✅ clean |
| `npx vite build --mode dev\|staging\|prod` | `admin/` | ✅ all three succeed, each baking a different API host |
| `flutter analyze` | repo root | ✅ clean |
| `flutter test --exclude-tags integration` | repo root | ✅ **292 passed** — this is what CI runs |
| `flutter test test/api_integration_test.dart` | repo root | ⚠️ **10 passed, 1 skipped, 1 failed** — needs the backend on `:4000`; see below |

Tests tagged `integration` talk to a live development server:

```bash
cd backend && npm run dev     # then, in another shell:
flutter test                  # full suite including integration
```

### Known failing test ⚠️ TEST DATA, NOT A CODE DEFECT

```
test/api_integration_test.dart
  أقسام الإكسسوارات والحقائب: تحميل منتجاتها ومجموعاتها الفرعية
```

The test asserts that **every** subcategory of «إكسسوارات» contains at least one
product. In the development database, 5 of its 8 subcategories are empty
(«ميداليات», «قلائد», «أساور», «ساعة يد / ساعة جيب», «إكسسوارات أخرى»). Those
subcategories were created through the admin dashboard; the seed script only
defines three.

Classified as a **test-data / merchandising expectation**, not a bug:

- The API handles an empty subcategory correctly — verified live, it returns
  `success: true` with `0` items rather than erroring.
- No application code is at fault.

It is **not fixed here** because the fix requires a product decision that is not
mine to make: either those subcategories should be stocked, or the test should
stop asserting catalogue completeness. Both options are listed under
[Release Readiness](#10-release-readiness).

### The skipped test

One integration test skips unless the development catalogue contains a product
that has *both* a previous price and a delivery promotion. Create one from the
admin dashboard to exercise it.

### CI ⚠️ PARTIALLY IMPLEMENTED

`.github/workflows/ci.yml` runs on pushes to `dev`/`staging`/`prod` and on pull
requests into `staging`/`prod`. It runs the backend suite against a throwaway
PostgreSQL service, the admin typecheck and build, and Flutter analyze + tests.
It never touches a real database.

Branch protection requires these three checks, so **a red CI blocks every merge**.
Two defects that made CI fail were fixed in this audit (see §10).

---

## 10. Release Readiness

### ✅ Completed and verified (dev)

- Three Git branches (`dev`, `staging`, `prod`) local and remote; `prod` is the
  GitHub default; `master` retained as history.
- Branch protection on `staging` and `prod` — PR required, 3 status checks,
  no force-push, no deletion, **enforced against admins** (verified by an
  attempted direct push, which was rejected).
- Flutter entry points `main_dev` / `main_staging` / `main_prod` sharing one
  runner; `flutter analyze` clean.
- Android product flavors `dev` / `staging` / `prod`; production
  `applicationId` unchanged. Gradle generates every variant task.
- Backend `APP_ENV` selection with `.env.<env>` loading; staging hardened
  exactly like production (verified live: it refuses to boot without secrets).
- Admin Vite modes with per-mode API hosts and a DEV/STAGING header badge.
- Order → delivery → rating lifecycle (§8) and the connection-pool guard.
- Full Flutter data layer restored to version control — a bare `data/` rule in
  `.gitignore` had been excluding `lib/features/*/data/` (23 source files), so
  a fresh clone could not build.
- Migration runner serialised with a PostgreSQL advisory lock; concurrent
  runners previously collided on system catalogues.

### ⚠️ Remaining before staging

| Item | Status | Notes |
|---|---|---|
| Staging database | 🔧 | not provisioned; only a config template exists |
| Staging backend host | 🔧 | not deployed |
| Real API hostnames | 🔧 | `*.otaku-galaxy.example` does not resolve |
| Staging secrets | 🔧 | `JWT_SECRET` must be generated (no SMS credentials — accounts are admin-managed) |
| Android build verification | ❌ | no JDK in the current environment — `flutter build` unverified |
| iOS flavors | ❌ | schemes and xcconfigs not configured |
| Green CI run | ⚠️ | fixes are in `dev`; the next push is the first real test |
| Catalogue data decision | ⚠️ | see the known failing test above |

### ⚠️ Remaining before production

| Item | Status | Notes |
|---|---|---|
| Everything in the staging list | 🔧 | staging must pass first |
| Production database | 🔧 | not provisioned |
| Production secrets | 🔧 | must never enter Git |
| Play Store signing | ❌ | release still signs with the debug key (`android/app/build.gradle.kts`) |
| Deployment pipeline | ❌ | CI runs tests only; there is no deploy step |
| Backup / restore plan | ❌ | none |
| Monitoring / alerting | ❌ | none |
| Load testing | ❌ | none |

### Not applicable

- **Firebase** — not used anywhere in the project.

## 11. Admin dashboard capabilities ✅ IMPLEMENTED

Everything below was implemented and verified in **dev**. Nothing in this
section was deployed, merged, or promoted to staging or production.

### 11.1 Order lifecycle — «تم تأكيده» merged into «قيد التجهيز»

```
طلب جديد  →  تأكيد الطلب  →  قيد التجهيز  →  قيد التوصيل  →  تم التسليم
```

The admin used to need two clicks — *confirm*, then *start preparing* — and the
stage between them meant nothing in the shop: a confirmed order **is** an order
being prepared. Confirming now moves the order straight to `PREPARING`.

- `CONFIRMED` remains a legal database value and keeps an outgoing transition,
  because real orders stopped there before the merge. Removing it would strand
  those rows in a state the machine no longer knows how to move. **No new path
  produces it.**
- `PREPARING` now carries the "order accepted" notification — but only when it
  arrives from `PENDING_ADMIN_CONFIRMATION`. A legacy order moved out of
  `CONFIRMED` does not get a second acceptance notification.
- The customer **keeps** the right to cancel during `PREPARING`. Before the
  merge they could cancel after the admin accepted; collapsing the stage
  simplifies admin work, it does not narrow customer rights.
- Flutter now shows «قيد التجهيز» and «قيد التوصيل» as distinct steps. It used
  to render preparation as "out for delivery", which promised a van that had
  not moved — and offered a *confirm receipt* button the server rejects with
  `NOT_OUT_FOR_DELIVERY`.

Covered by `backend/tests/order-status-flow.test.ts` (8 tests).

### 11.2 Anime classification and search ✅ IMPLEMENTED

Anime (`franchises`) is a **third, independent** axis — it does not touch the
category tree:

```
Category: إكسسوارات   Subcategory: قلادات   Anime: Demon Slayer
```

Search now matches **product name OR anime name OR any anime alias**. The
`franchises` table and `product_franchises` links existed since migration 014,
but nothing in the search path read them: a product called «قلادة فضية» tagged
Demon Slayer was unreachable to a customer searching for the anime.

- New `franchises.alt_names TEXT[]` (migration 025) holds Arabic / English /
  transliterated names. One name is not enough — an Iraqi customer types
  whichever comes to mind.
- Inactive anime are **not** matched. Hiding an anime hides it from search too;
  otherwise search becomes a back door to what was deliberately hidden.
- Aliases are editable per anime in the dashboard (الأنمي → أسماء بديلة للبحث).

Covered by `backend/tests/anime-search.test.ts` (9 tests).

### 11.3 Governorates & delivery ✅ IMPLEMENTED

Two screens («المحافظات» and «مناطق التوصيل») became one: **المحافظات والتوصيل**,
with each governorate's zones on an expandable row.

Splitting them hid the relationship that actually decides the price: the
governorate fee applies **only while the governorate has no zones**; the moment
one active zone exists, choosing a zone becomes mandatory at checkout and the
zone fee replaces it. An admin editing the Najaf fee could not see why the
customer's total never changed.

Najaf is **data, not code**:

| Zone | Fee |
|---|---|
| داخل قضاء النجف | 3,000 IQD |
| خارج قضاء النجف | 4,000 IQD |

The fee is computed **on the server** from the selected zone. Any
`deliveryFee` / `total` sent by the client is ignored. Other governorates can
be split into zones from the dashboard with no code change.

Covered by `backend/tests/delivery-zones.test.ts` (9 tests).

### 11.4 Notification targeting ✅ IMPLEMENTED (in-app records only)

`POST /admin/notifications/broadcast` accepts three audience shapes:

| Audience | Meaning |
|---|---|
| `all` | every active customer |
| `users` | a hand-picked list (max 500) |
| `segment` | a computed slice — see below |

Segments: `birthday_today`, `birthday_upcoming`, `birthday_recent`,
`birthday_missing`, `has_orders`, `no_orders`. The birthday segments accept a
`windowDays` value (the dashboard offers 7 / 14 / 30).

- `POST /admin/notifications/audience` returns the recipient count **before**
  sending, using the same query that will select recipients.
- The payload schema is **strict**. `audience: "all"` together with a `userIds`
  list is rejected with 400. Zod strips unknown keys by default, which would
  have let that payload through and mailed *every* customer while the admin
  believed they were messaging two. No message can be recalled after sending.
- Blocked accounts never receive a broadcast.

**⚠️ NOT push notifications.** There is no push provider connected. The API
returns `{ recipients, push: null }` and the dashboard states it plainly. A
record is written to the customer's in-app inbox and read when they next open
the app. `push` is `null` — not `0`, and never "delivered".

**❌ Scheduled sending is NOT implemented.** The only scheduler in the system is
the rating reminder, which is driven by order state, not by a calendar. Nothing
would fire a scheduled notification, so none is offered.

Covered by `backend/tests/admin-audience.test.ts` (20 tests, shared with
birthdays and customer search).

### 11.5 Galaxy Points — fixed business rules ✅ IMPLEMENTED

> **Superseded.** This section previously described the ladder as admin-managed
> data in `loyalty_levels` (migration 027). STEP 40 reversed that: the ladder and
> the point values are now **fixed business rules** in
> `backend/src/domain/galaxyPoints.ts`, and `loyalty_levels` was dropped. The
> full reasoning and the complete rule set are in
> [`PROJECT_FEATURE_SPEC.md` § STEP 40](PROJECT_FEATURE_SPEC.md).

The rules, in short:

- **Purchase points:** 5 per 10,000 IQD of `max(0, products_total − discount)`.
  Delivery is excluded; the remainder is discarded and never carried forward.
- **Review points:** 1 for a written comment, a flat 5 for attaching 1–5 photos
  (not 5 each), so 6 at most for one review. Maximum 5 photos, enforced in the
  schema, the service and a database `CHECK`.
- **Per-order cap:** review points for one order never exceed 20. Purchase
  points sit outside the cap. Enforced with `SELECT … FOR UPDATE` on the order
  so concurrent approvals cannot exceed it.
- **One review per customer per product, forever** — a repeat purchase opens no
  second review and pays no second reward.
- **Seven fixed levels** at 0 / 100 / 250 / 400 / 600 / 800 / 1,000 points,
  carrying one-time discount rewards (3% ≤ 5,000 · 5% ≤ 10,000 · 10% ≤ 20,000)
  and one-time gifts (5,000 · 10,000 · 25,000 IQD).
- **One-time redemption** guarded by `UNIQUE (user_id, level_key)` in the
  database, not by a check in the service.

What did **not** change:

- **[CRITICAL] The ledger is never rewritten.** A new ladder changes how a
  balance is *interpreted*, never its amount. No historical row was touched, and
  no past reward was auto-marked as claimed.
- The server still computes placement (`level`, `nextLevel`,
  `pointsToNextLevel`, `levelProgress`); Flutter renders and never derives.
- Flutter still has **no fallback ladder** — the screen says it could not load
  rather than showing values it cannot vouch for.

The dashboard now shows these rules **read-only** (نقاط المجرّة → قواعد نقاط
المجرّة) and manages only gift fulfilment. Covered by
`backend/tests/galaxy-points-rules.test.ts`, `loyalty-rewards.test.ts` and
`galaxy-levels.test.ts`.

### 11.5a Birthday discount & review opening ✅ IMPLEMENTED

> STEP 41. Both are now fixed rules, not settings — see
> [`PROJECT_FEATURE_SPEC.md` § STEP 41](PROJECT_FEATURE_SPEC.md).

- **Birthday discount is fixed at 5%** (`backend/src/domain/birthday.ts`). The
  feature is unchanged — eligibility, once-per-year enforcement and the order
  transaction all behave as before; only the percentage stopped being editable.
- **Review opens on receipt.** There is no delay any more: confirming
  «استلمت طلبي» makes the order reviewable in the same response. The server
  sends `canReview` ready-made, and the app shows «قيّم طلبك» inside that
  order's card only.
- **No business-settings page.** With the Galaxy Points values, the birthday
  percentage and the review delay all gone, no numeric business setting
  remained, so `GET|PATCH /admin/settings/business` was removed entirely.
  Social links and app-version settings are unaffected.

### 11.5b Gender-aware Arabic ✅ IMPLEMENTED

`users.gender` (`male` / `female` / `NULL`) exists for one reason: Arabic
conjugates the second person. Required at registration, nullable forever for
existing accounts, and never inferred.

Flutter resolves the form in one place (`lib/core/l10n/gender.dart`). Accounts
with no gender get **neutral** wording, not masculine — see § STEP 40.13.

### 11.6 Birthday management ✅ IMPLEMENTED

Filters: **اليوم · قادمة (٧/١٤/٣٠) · مؤخّراً · لم يسجّل · المسجَّلون · الكل**, each
with a live count, and a one-click "notify this group" that opens the composer
pre-targeted at the same segment with suggested text.

**[CRITICAL] "Today" is the customer's calendar, not the server's clock.**
Dates are computed in `STORE_TIMEZONE` (default `Asia/Baghdad`). A UTC server
sees a new day at 03:00 Baghdad time: the next day's greeting would arrive
three hours before the current one ended, and the real birthday would be filed
as "yesterday". 29 February is handled — celebrated on the 28th in non-leap
years rather than dropping that customer from every list.

**❌ Automatic birthday sending is NOT implemented** and is not claimed. There is
no calendar scheduler; greetings are sent by an admin click.

### 11.7 Customer search and filters ✅ IMPLEMENTED

`GET /admin/users` now takes `search`, `isActive`, `hasBirthday`, `hasOrders`,
`minPoints`, `maxPoints`, `gender`, `levelKey`, `sort`, `page`, `limit`.
`search` matches username, phone (digits only) **and the account id prefix**;
`levelKey` is turned into a points range from the fixed galaxy ladder in SQL.

**All filtering happens in SQL.** Filtering a paginated list in the browser
shows only the current page's matches — it looks right on twenty customers and
silently lies on twenty thousand. Phone search strips non-digits, so
«٠٧٧١ ٢٣٤ ٥٦٧٨» finds its owner despite the spaces. The list carries points,
order counts and last-order date; it never carries `password_hash` or
`token_version`.

`gender` accepts `male` or `female` only — the store has exactly two genders
(STEP 66; `gender=unknown` is a 400). Every response also carries
`genderCounts` — total / male / female, computed in SQL over everything matching
the current search, never summed from the page on screen. `NULL` is not a third
gender: it marks an account created before migration 040 that was never asked.
It is shown as «—», counted only in the total, never counted as male and never
back-filled by guessing; the customer sets it from Settings in the app (male or
female); see § 11.5b. The full phone is displayed unmasked on the admin customer-management
screens and on the restock-demand screen — both sit behind `requireAdmin`, and
store staff need the number to reach the customer (a «واتساب» action opens the
chat; it never sends anything). No customer-facing or public route returns it.

### 11.7a Admin-managed accounts — no SMS / no OTP ✅ IMPLEMENTED

**The decision.** The app does not use SMS OTP or email OTP for account
creation or logged-out password recovery. Both are **requests** an
administrator resolves from the dashboard after verifying the person over
WhatsApp — manually; nothing pretends the WhatsApp step is automated.

```
Registration     form (unchanged) → POST /auth/register → users row (unverified,
                 bcrypt hash) + account_requests(kind=registration, pending)
                 → dashboard «طلبات الحساب» → admin verifies on WhatsApp
                 → POST /admin/account-requests/:id/approve  (sets phone_verified_at)
                 → customer logs in normally with the password they chose.

Forgot password  phone + name + gender + account level → POST /auth/forgot-password
                 → account_requests(kind=password_reset, pending; the four fields
                 stored *as submitted* next to the stored profile)
                 → dashboard shows submitted vs stored with match hints
                 → admin verifies on WhatsApp
                 → PATCH /admin/customers/:id/password {newPassword, requestId}
                 → admin tells the customer the password → customer logs in → Home.

Logged in        Settings → Change Password (current + new) → PATCH /auth/me/password.
```

**Critical password rule.** The administrator-assigned password is the
account's normal, **permanent** password. There is no temporary password, no
`must_change_password`, no forced change, no post-login page, no expiry, no
special login state. The customer changes it later from Settings only if they
want to. The four identity fields are information for the administrator — a
full match **never** authenticates and **never** resets anything.

**Security.** `/api/admin/*` sits behind `authenticate` + `requireAdmin`;
customers get 403 on every request endpoint including their own. A request id
authorizes nothing by itself: `setCustomerPassword` re-checks the request is
pending, of kind `password_reset`, and linked to *that* account. Passwords are
bcrypt-hashed server-side, never returned, never logged; the old password is
unrecoverable. Rejected requests stay in `account_requests` as history; one
pending request per (kind, phone) is enforced by a partial unique index.
`login` refuses unverified accounts with `ACCOUNT_PENDING_APPROVAL` /
`ACCOUNT_REQUEST_REJECTED` — it never sends anything.

**Removed.** `/auth/verify`, `/auth/resend-code`, `/auth/reset-password`, the
`verification_codes` service, the SMS provider and its boot check, the
`DEV_OTP_*`/`SMS_*`/`VERIFICATION_*` configuration, and the Flutter OTP/reset
screens. The sources are preserved, uncompiled, under `legacy/otp/`.

### 11.8 Banners — traced end to end ✅ VERIFIED

The reported symptom ("admin adds a banner, nothing appears in the app") was
already fixed in an earlier batch, when `banner_carousel.dart` stopped ignoring
the server payload. This batch **traced the whole path against real dev data**
rather than rebuilding it:

```
Dashboard → POST /admin/banners → banners table → GET /catalog/home → Flutter
```

Verified live in dev: two active banners returned by `/catalog/home`, both
image references relative (`/uploads/banner/…`), both served `200` with the
correct content type. Ordering, active/inactive, destination and delete are
covered by `backend/tests/banner-pipeline.test.ts` (8 tests) — including a guard
that image references stay **relative**, since an absolute URL baked at upload
time works in a browser and fails on a phone, where `localhost` is the phone.

**Start/end dates do not exist** on banners and were not invented.

### 11.9 Category → subcategory → products → add ✅ IMPLEMENTED

```
الأقسام  →  (expand)  →  القسم الفرعي  →  عرض المنتجات  →  إضافة منتج
```

`GET /admin/products` now accepts `categoryId` / `subcategoryId`, the products
page reads them from the URL (so the view is shareable and the back button
works), and "إضافة منتج" carries the scope into **the existing product form**
with the category and subcategory already selected. There is no second creation
flow. Category, subcategory and anime stay independent.

Covered by `backend/tests/catalog-navigation.test.ts` (7 tests), including a
case that proves the filter spans pages instead of filtering one page.

### 11.10 Dashboard UX ✅ IMPLEMENTED

- **Navigation grouped** by what the admin does — العمليات / الكتالوج / الزبائن /
  التسويق / الإعدادات. Fourteen flat items meant a visual search every time.
  Groups (not collapsible submenus) keep everything one click away.
- **Overview** gained the stages that actually need action: قيد التجهيز,
  today's birthdays, customers with no birthday recorded, notifications in the
  last 7 days. Every KPI links to the filtered screen behind it. All numbers
  come from one aggregated `/admin/stats` query — none are invented.
- **Order status labels** now read طلب جديد / قيد التجهيز / قيد التوصيل /
  تم التسليم. The «تم تأكيده» tab appears **only if a legacy order is still in
  it** — a permanent zero tab implies a stage that no longer exists.
- **Responsive**: sidebar on desktop, drawer below `lg` (verified at 319 px),
  content padding shrinks on narrow screens, every wide table scrolls inside
  its own container.

### 11.11 Configuration that no longer needs a code change

| Was hardcoded | Now managed from |
|---|---|
| Delivery fees per governorate/zone | المحافظات والتوصيل |
| Anime list and search aliases | الأنمي |
| Notification audiences | الإشعارات → إشعار جديد |
| Banners and their destinations | البنرات |


## 12. Migrations added in this batch

| File | Purpose |
|---|---|
| `025_franchise_aliases_and_search.sql` | `franchises.alt_names`, search text helper, trigram + link indexes, Arabic aliases for known anime |
| `026_birthday_calendar.sql` | `safe_birthday_date()` / `next_birthday()` (leap-year and year-wrap safe), birthday index |
| `027_loyalty_levels.sql` | `loyalty_levels` table seeded with the exact previous Flutter values, unique thresholds, deferred trigger enforcing an active level at 0 — **later dropped by 039** |

All three are **additive**. No existing migration was edited or removed, and no
migration drops or rewrites customer data.

> **Note on 027.** STEP 40 (migration `039_galaxy_points_fixed_rules.sql`) drops
> `loyalty_levels` because the ladder became a fixed rule in code. That drop
> removes *configuration* only — no ledger row, balance or customer record is
> touched. Migrations `039`–`042` are listed in
> [`PROJECT_FEATURE_SPEC.md` § STEP 40](PROJECT_FEATURE_SPEC.md).

## 13. Dynamic character artwork ✅ IMPLEMENTED (dev)

Decorative character illustrations are managed from the Admin Dashboard.
Changing a character no longer requires a Flutter release on both stores and a
wait for every customer to update.

**ONE LOCATION = ONE SLOT = ONE ACTIVE IMAGE** (product decision 2026-09-20,
migrations 054 + 055). A slot is a *location* in the app (screen + spot). It
holds zero or one **permanent** image, and the admin may put one **temporary**
image on top of it until a chosen moment; the customer always sees exactly one
image — the temporary one while it is live, otherwise the permanent one,
otherwise the bundled asset. Slots are independent of each other even when two
locations happen to show the same character. There is no daily rotation, no
image list and no hide/show toggle: the temporary image is an *override with an
expiry*, not a carousel, and it never overwrites the permanent image.

```
Admin Dashboard  →  POST /admin/uploads (purpose=slot)
                 →  PUT  /admin/visual-slots/:id/image             { url }          permanent
                    DELETE /admin/visual-slots/:id/image                            → bundled
                    PUT  /admin/visual-slots/:id/temporary-image   { url, until }   override
                    DELETE /admin/visual-slots/:id/temporary-image                  → ends it now
                        ↓
                 visual_slots.image_url  +  temporary_image_url / temporary_until   (one row)
                        ↓  active = COALESCE(temporary while temporary_until > now(), image_url)
                 GET /catalog/visuals   ← { version, now, nextChangeAt, slots:[{slotKey, currentUrl}] }
                        ↓
                 VisualsRepository      ← snapshot restored before first frame, disk warm-up,
                                          refreshed on splash/resume and at nextChangeAt
                                          (one timer ≤ 1 day, re-armed from the server clock)
                        ↓
                 ManagedArtwork(slot:, fallbackAsset:)   key = 'managed-artwork:<slot>'
                        ↓
                 that slot's active image  →  or that slot's bundled fallback
```

### 13.1 The rule everything else follows

**A slot with no image is not sent to the app at all.** Its absence is the
signal to render the bundled asset. This is why removing an image from the
dashboard is safe: the screen returns to the artwork it shipped with instead of
going blank. Upgrading the server changes nothing either — seeded rows carry no
image until the admin uploads one.

`ManagedArtwork` takes `fallbackAsset` as a **required** argument and every
failure path ends there: slot unset, malformed URL, network down, request timed
out, image deleted server-side, file corrupt, cache unavailable. No call site
writes its own `errorBuilder`.

Per-slot state machine (deterministic in every frame):

| Configuration known? | Slot has an active image? | Rendered |
|---|---|---|
| no (very first launch, corrupt snapshot) | — | bundled fallback of **this** slot |
| yes (restored snapshot, then server) | no | bundled fallback of **this** slot |
| yes | yes | **this** slot's active image (its own `ValueKey`) — never another slot's |

"Active" is decided **once, in SQL** (`visualsRepo.ts`, `ACTIVE_URL`): the
temporary image while `temporary_until > now()`, else the permanent image. The
app and the dashboard both consume that result; neither re-implements the rule
or compares clocks. Expiry therefore needs no job and no write — the next read
simply returns the permanent image.

### 13.2 Slot catalogue — 46 slots, one per location

Seeded by migrations 029 (catalogue), 054 (split of the four shared slots) and
055 (`offline_gate_character`);
`home_categories_backdrop` (031), `otp_character` (049), the three `social_*`
icons (053) and the four shared keys `register_character`,
`forgot_password_character`, `auth_cta_character`, `guest_prompt_character`
(054) are **retired** and must never come back.

| Group | Slots | Keys |
|---|---|---|
| المصادقة | 8 | `login_character` · `login_cta_character` · `register_header_character` · `register_cta_character` · `register_pending_character` · `forgot_password_header_character` · `forgot_password_cta_character` · `forgot_password_pending_character` |
| الترحيب والتخصيص | 4 | `onboarding_slide_one_character` · `onboarding_slide_two_character` · `onboarding_slide_three_character` · `personalize_character` |
| الرئيسية | 4 | `home_hero_character` · `home_promo_primary_character` · `home_promo_secondary_character` · `home_delivery_character` |
| التسوّق | 10 | `empty_cart_character` · `cart_guest_prompt_character` · `cart_checkout_character` · `empty_favorites_character` · `favorites_guest_prompt_character` · `categories_header_character` · `category_products_header_character` (whole category empty) · `empty_category_products_character` (subcategory empty) · `product_detail_character` · `product_detail_reviews_character` |
| البحث | 2 | `search_header_character` · `empty_search_character` |
| الطلبات | 4 | `orders_header_character` · `empty_orders_character` · `order_success_character` · `delivery_confirmation_character` |
| المكافآت | 1 | `points_character` |
| المجتمع والتقييمات | 7 | `community_header_character` · `community_empty_character` · `community_gallery_character` · `product_reviews_character` · `write_review_character` · `rate_order_character` · `review_submitted_character` |
| المجموعات | 1 | `collections_tab_character` (My-Collections empty state) |
| الحساب والإشعارات | 2 | `account_character` · `notifications_header_character` |
| انقطاع الاتصال | 1 | `offline_gate_character` (055 — served from the disk cache, bundled fallback) |

Split performed by 054 (each new sibling copied its origin's image, so nothing
changed on screen until the admin decides):

| Was (shared) | Now (one per location) |
|---|---|
| `register_character` — register header **and** pending-approval screen | `register_header_character` · `register_pending_character` |
| `forgot_password_character` — forgot header **and** pending-approval screen | `forgot_password_header_character` · `forgot_password_pending_character` |
| `auth_cta_character` — form-card corner art on login, register, forgot | `login_cta_character` · `register_cta_character` · `forgot_password_cta_character` |
| `guest_prompt_character` — guest login card on cart and favorites tabs | `cart_guest_prompt_character` · `favorites_guest_prompt_character` |

Naming: `<screen>_<spot>_character`; the Arabic `label`/`location` in the DB
name the screen and the exact spot and are what the dashboard shows. Two
code sites may build one location (`home_hero_character`: banner-error
fallback and no-banner; the promo cards: managed banner or default card) —
that is one location, not sharing. Promo cards 2..n share
`home_promo_secondary_character` on purpose: the card count is admin-defined
and a per-card picture is the banner's own image, not a slot.

Guards: `test/visual_slot_contract_test.dart` (each constant consumed by
exactly one `lib/` file, no default slot in `core/design_system`, no literal
keys, retired keys absent) and `backend/tests/visual-catalogue.test.ts`
(Flutter constants == DB rows == dashboard items, retired keys absent, split
keys present, descriptions name one screen).

### 13.2b Not artwork — no slots exist

| Surface | What it actually is |
|---|---|
| Bottom navigation | Material `Icon`s, no images |
| Error states (`AnimeErrorState`) | Material `Icon`s, no artwork parameter |
| Birthday feature | No illustration of any kind in the source |
| Instagram / TikTok / WhatsApp | Fixed Material glyphs; only the links are settings (`store_settings.social_*`) |

### 13.2c Already remote — not duplicated

Eight `Image.network` sites already load server-driven content and are outside
this system: banners, product photos, customer review photos, community
gallery, order item images, the account avatar, franchise and category images
(category cards no longer render one — STEP 49).

### 13.3 Permanently local — no slots exist for these

| Surface | Why |
|---|---|
| Splash | Renders before any network call exists |
| Force-update screen | Shown before the app is allowed to talk to the API |
| Store logo | Brand identity, and appears inside the offline gate |

Their bundled assets must not be removed. Onboarding and personalize **are**
managed; they render their bundled asset as the first frame on the very first
launch and the restored snapshot afterwards.

The **offline gate** used to be in this table. Since 055 it is a managed slot
(`offline_gate_character`) because the architecture makes that safe: `prefetch()`
puts every slot image on disk during the splash, `warmRestored()` decodes it
into `ImageCache` on the next launch, and `ManagedArtwork` renders the bundled
`a-i17.png` on every failure path — so with no network the screen shows the
cached image or the bundled art, never a blank. Guarded by `offline_gate_test.dart`.

### 13.4 Replacing / removing the permanent image

The dashboard row shows the location, the image the customer sees **now**
(`activeImageUrl`, or «مضمَّن»), the status («صورة دائمة» / «مؤقّتة حتى …» /
«الرسم المضمَّن») and one action. In the drawer, the mode «صورة دائمة» (default)
uploads to `PUT …/image`; when a permanent image exists, one button
(**إزالة الصورة الدائمة — العودة إلى الرسم المضمَّن**) calls `DELETE …/image`.
The server accepts only an admin upload with `purpose = 'slot'` that exists in
`media_files`; external URLs and customer uploads (review photos, avatars) are
rejected — the same check guards the temporary route. Slots cannot be created
or deleted from the dashboard — they are defined by migrations so the catalogue
always matches the app.

`version` in `GET /catalog/visuals` is an MD5 of the ordered
`(slot_key, active_url)` pairs — a content hash. The app rebuilds artwork only
when what the customer sees actually changed, which includes the moment a
temporary image expires.

### 13.4b Temporary image (override with an expiry) — migration 055

| | |
|---|---|
| Columns | `temporary_image_url`, `temporary_media_id` (→ `media_files`, `ON DELETE SET NULL`), `temporary_until TIMESTAMPTZ`; CHECK: url and until are both set or both null |
| Set | `PUT /admin/visual-slots/:id/temporary-image { url, until }` — `until` is an ISO-8601 instant with offset (zod `datetime({offset:true})`, like `restockAt`); the past (`TEMPORARY_UNTIL_PAST`) and more than 366 × 24 h away (`TEMPORARY_UNTIL_TOO_FAR`) are rejected **inside the `UPDATE` that writes the override, by PostgreSQL's `now()`** — the same clock that decides liveness on every read; Node's clock is not consulted (F6) |
| End early | `DELETE /admin/visual-slots/:id/temporary-image` — the permanent image (or bundled) shows immediately |
| Expiry | Nothing runs. Every read resolves `temporary_until > now()` in SQL, so the permanent image returns by itself; the admin list reports an expired override as `null`. The three columns stay stored after expiry **by design** (no cleanup job — read-time evaluation was chosen so that nothing can be late), and the media stays referenced until the override is replaced or ended (see *Media references*) |
| Isolation | The two routes write disjoint columns in one atomic `UPDATE` each, so a permanent upload and a temporary upload arriving together both persist (tested) |
| Dashboard | Mode toggle «صورة دائمة / صورة مؤقّتة حتى يوم»; the admin picks a **day** and the page sends the end of that day in the **store timezone** (`timezone` in the admin list = `STORE_TIMEZONE`, the same calendar the birthday feature uses — not the admin browser's zone), as an absolute instant the server compares with its clock. The picker offers only days the server will accept: the day must not have ended in the store zone, and its end-of-day instant must be within 366 × 24 h (the day 366 calendar days out is *not* offered — its end would be rejected after the upload); the same check runs again just before uploading so an expired choice never leaves an unreferenced upload. The page also schedules **one** refetch at the earliest `temporaryUntil` (capped at one day, re-armed on every response), so an expired override disappears from the table without «تحديث». The row and the drawer say until when and what returns afterwards; the hidden permanent image is shown in its own card so it never looks lost |
| App | Reads one `currentUrl` per slot and never knows which kind it is. The payload also carries `now` and `nextChangeAt` (server clock): `VisualsRepository` schedules **one** `refresh()` for `nextChangeAt - now` **capped at one day**, cancelled and re-armed on every response. An expiry within a day fires at its exact moment, so a foregrounded app swaps back on time; an expiry farther away is reached through intermediate refreshes — each one re-reads `now`/`nextChangeAt` from the server and re-arms for at most another day — because a browser `setTimeout` beyond ~24.8 days fires immediately on Flutter Web. A device clock that is minutes off changes nothing because both values come from the server; `dispose()` cancels whichever timer is pending |
| Media references | While a temporary image is stored, `temporary_image_url` / `temporary_media_id` count as live references in `mediaRepo.findUnreferenced`, exactly like `image_url` / `media_id`. A `temporary_until` in the past does **not** make the file unreferenced; only ending the override or replacing it removes the reference. Detection is read-only — nothing deletes |
| Offline past expiry | The restored snapshot is shown immediately, and while there is no network the snapshot (or the bundled art) stays in use — the app does not have the permanent URL by design. A fresh fetch happens at the next launch (the startup `refresh()`), on resume (2-minute throttle) or when the scheduled timer fires; a connectivity change by itself triggers no fetch. The first successful fetch corrects the image |

### 13.5 Cache and the restart flicker

`cached_network_image`; images are served with
`Cache-Control: public, max-age=2592000, immutable`, which is correct because
filenames are UUIDs — a replaced image is a new upload with a new UUID.

Root cause of the old restart flicker: the configuration lived in memory only,
so every cold start rendered every bundled asset as if authoritative, then
swapped twice when `GET /visuals` arrived. Fix (STEP 48, kept): the last
successful configuration is persisted (`SharedPreferences`,
`visual_slots_snapshot`) and restored synchronously before the first frame;
`warmRestored()` decodes the images already on disk into the in-memory
`ImageCache` (disk only, bounded budget, no network) so the first content frame
paints the server image; each `ManagedArtwork` is keyed by its slot so an
element can never carry another slot's frame; a URL change keeps the current
image until the new one is decoded. `refresh()` and `prefetch()` run during the
splash without blocking it. The only visible transition left is by design:
when the admin changed an image while the app was closed and the network is
slower than the splash, the previous image **of that slot** shows until the
refresh lands — never another slot's image and never the bundled asset.

### 13.6 Admin usage

1. Open **التسويق → رسوم الشخصيات**.
2. Expand the group (المصادقة, التسوّق, …) and find the location by its
   description — no Flutter filenames needed. Every label reads
   «شخصية <الشاشة> <الحالة>» (e.g. «شخصية نتائج البحث الفارغة»).
3. **استبدال الصورة** / **رفع صورة** opens the drawer. With **صورة دائمة**
   selected, drop a PNG/JPG/WebP — it uploads and replaces in one step and the
   app shows it on its next refresh (launch or resume).
4. For an occasion, pick **صورة مؤقّتة حتى يوم**, choose the last day it should
   show, then drop the image. The row turns «مؤقّتة حتى …» and says what
   returns afterwards; nothing else to do when the day ends.
5. **إنهاء الصورة المؤقّتة الآن** ends an override early; **إزالة الصورة
   الدائمة** returns the location to the bundled artwork.

## 14. Home banners ✅ IMPLEMENTED (dev)

The Home screen previously had three visual blocks from three sources: a hero
baked into the code, a promo rail baked into the code, and a server-driven
carousel below them. The admin owned only the last one.

All of it is now the **existing `banners` table**, with a `placement` column —
no second banner system was invented.

| Placement | Where | Count |
|---|---|---|
| `hero` | The large panel at the top of Home | One shown — first by sort order among active |
| `promo` | The horizontal strip beneath it | Unlimited, in the admin's order |

Each banner carries image, title, subtitle, destination and sort order.
Destinations: product · category · subcategory · **anime** · none.

- An unset hero leaves the bundled design exactly as it was.
- An empty promo list leaves the two bundled cards exactly as they were.
- **The third carousel was removed** from Home and its widget file deleted.
  Existing banners were migrated to `promo`, so nothing already uploaded
  disappeared.

Manage from **البنرات**: the موضع column shows where each banner lands, and the
active toggle now works (the page previously claimed the API could not toggle
one — it always could).
