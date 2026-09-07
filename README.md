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
| Fixed OTP `123456` | allowed | **refused at boot** | **refused at boot** |
| SMS provider | `console` | real (`http`) | real (`http`) |
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
  exactly like production (verified live: it refuses to boot without secrets
  and refuses the fixed dev OTP).
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
| Staging secrets | 🔧 | `JWT_SECRET`, SMS credentials must be generated |
| SMS provider account | 🔧 | no provider connected; `http` provider is implemented but never tested against a carrier |
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
`minPoints`, `maxPoints`, `gender`, `sort`, `page`, `limit`.

**All filtering happens in SQL.** Filtering a paginated list in the browser
shows only the current page's matches — it looks right on twenty customers and
silently lies on twenty thousand. Phone search strips non-digits, so
«٠٧٧١ ٢٣٤ ٥٦٧٨» finds its owner despite the spaces. The list carries points,
order counts and last-order date; it never carries `password_hash` or
`token_version`.

`gender` accepts `male`, `female` or `unknown` (`gender IS NULL`), and every
response also carries `genderCounts` — total / male / female / unknown, computed
in SQL over everything matching the current search, never summed from the page
on screen. `NULL` is shown as «غير محدد» and is never counted as male; see
§ 11.5b. The full phone is displayed unmasked on the admin customer-management
screens and on the restock-demand screen — both sit behind `requireAdmin`, and
store staff need the number to reach the customer (a «واتساب» action opens the
chat; it never sends anything). No customer-facing or public route returns it.

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

Decorative character illustrations are now managed from the Admin Dashboard.
Changing a character no longer requires a Flutter release on both stores and a
wait for every customer to update.

```
Admin Dashboard  →  POST /admin/uploads (purpose=slot)
                 →  POST /admin/visual-slots/:id/images
                        ↓
                 visual_slots · visual_slot_images
                        ↓
                 GET /catalog/visuals   ← server resolves rotation
                        ↓
                 VisualsRepository      ← refreshed once on splash
                        ↓
                 ManagedArtwork(slot:, fallbackAsset:)
                        ↓
                 remote image  →  or bundled fallback
```

### 13.1 The rule everything else follows

**A slot with no active image is not sent to the app at all.** Its absence is
the signal to render the bundled asset. This is why deleting an image from the
dashboard is safe: the screen returns to the artwork it shipped with instead of
going blank. It is also why upgrading the server changes nothing — no slots are
seeded, so every screen renders exactly what it rendered before.

`ManagedArtwork` takes `fallbackAsset` as a **required** argument. Every failure
path ends there: slot unset, malformed URL, network down, request timed out,
image deleted server-side, file corrupt, cache unavailable. No call site writes
its own `errorBuilder` — the one that existed (the delivery sheet) was removed
because the widget already covers it.

### 13.2 Slot catalogue — 44 slots

Derived from an exhaustive scan of the Flutter source: **47** asset literals, of
which 5 are permanently local (below) and **41 are managed**, plus 3 social-icon
slots — 44 in total. There are no
`AssetImage`, `ExactAssetImage` or `DecorationImage` references anywhere in
`lib/`, so `Image.asset` plus the named artwork parameters are the complete set.

**One slot per placement.** «شخصية تسجيل الدخول» and «شخصية إنشاء الحساب» are
different screens to a shop owner even when the drawing is similar, so they get
separate slots. Only two slots cover more than one screen, and both are a single
literal in the code rather than a design choice:

| Shared slot | Covers | Why one slot |
|---|---|---|
| `auth_cta_character` | All four auth screens | One panel inside `AuthScaffold`; changing it is one decision, not four |
| `guest_prompt_character` | Cart + favorites login gates | One default value in `AnimeGuestPrompt` |

Slots are **seeded** by migration 029 so the dashboard is browsable without
knowing any Flutter filename. Seeding changes nothing in the app: a slot with no
active image is never sent.

| Group | Slots | Keys |
|---|---|---|
| المصادقة | 6 | `login_character` · `register_character` · `otp_character` · `forgot_password_character` · `auth_cta_character` · `guest_prompt_character` |
| الترحيب والتخصيص | 4 | `onboarding_slide_one_character` · `onboarding_slide_two_character` · `onboarding_slide_three_character` · `personalize_character` |
| الرئيسية | 4 | `home_hero_character` · `home_promo_primary_character` · `home_promo_secondary_character` · `home_delivery_character` |
| التسوّق | 9 | `empty_cart_character` · `cart_checkout_character` · `empty_favorites_character` · `categories_header_character` · `empty_categories_character` · `category_products_header_character` · `empty_category_products_character` · `product_detail_character` · `product_detail_reviews_character` |
| البحث | 2 | `search_header_character` · `empty_search_character` |
| الطلبات | 4 | `orders_header_character` · `empty_orders_character` · `order_success_character` · `delivery_confirmation_character` |
| المكافآت | 1 | `points_character` |
| المجتمع والتقييمات | 7 | `community_header_character` · `community_empty_character` · `community_gallery_character` · `product_reviews_character` · `write_review_character` · `rate_order_character` · `review_submitted_character` |
| المجموعات | 2 | `collections_tab_character` · `empty_collection_character` |
| الحساب والإشعارات | 5 | `account_character` · `notifications_header_character` · `social_tiktok` · `social_instagram` · `social_whatsapp` |

Every placement keeps **its own** bundled fallback, so nothing changes until the
admin uploads to that specific slot.

A test (`backend/tests/visual-catalogue.test.ts`) parses the Dart constants file
and compares it against the database in both directions. A typo in a slot key is
otherwise a **silent** failure — the dashboard looks configured, the admin
uploads an image, and nothing ever changes in the app.

### 13.2b Not artwork — no slots exist

| Surface | What it actually is |
|---|---|
| Bottom navigation | Material `Icon`s, no images |
| Error states (`AnimeErrorState`) | Material `Icon`s, no artwork parameter |
| Birthday feature | No illustration of any kind in the source |

### 13.2c Already remote — not duplicated

Eight `Image.network` sites already load server-driven content and are outside
this system: banners, category cards, product photos, customer review photos,
community gallery, order item images, and the account avatar.

### 13.3 Permanently local — no slots exist for these

| Surface | Why |
|---|---|
| Splash | Renders before any network call exists |
| Offline gate | Shown precisely when the network is gone |
| Store logo | Brand identity, and appears inside the offline gate |

Their bundled assets must not be removed. Onboarding and personalize **are**
managed, but render their bundled asset as the first frame and only swap after
the configuration arrives — they run before the first successful API call.

### 13.3b Replacing an image

Uploading into a slot that already has an active image **replaces** it: every
existing image is deactivated and the new one is inserted first, so it is what
the app shows immediately. "إضافة صورة إلى مجموعة التدوير" is the separate,
explicit action for building a rotation set.

This distinction is the whole feature. Before it existed, an upload appended to
the end of the list while `fixed` rotation read the head — the dashboard showed
the new image and the app kept the old one, with no error anywhere.

Replaced images are **deactivated, not deleted**: the file stays on disk and
undo is one toggle.

The app re-reads the configuration on resume (throttled to two minutes) and
only rebuilds when the returned `version` hash actually changed.

### 13.4 Rotation

| Mode | Behaviour |
|---|---|
| `fixed` | Always the first image in the admin's order. |
| `daily` | Changes once per day, deterministically. |

**The server resolves the rotation and returns one URL.** The app holds a URL,
not an algorithm — so a character cannot change when a widget rebuilds, and two
phones never disagree. The daily index is `(days since epoch in store timezone)
% imageCount`, computed in SQL. A device clock cannot shift it, and no
per-device state is stored. The response carries `validUntil` (next store
midnight) so a client can know when the answer expires.

`sequential` and `random` are **deliberately deferred**. Both need a per-device
counter — state that must be stored, synchronised and eventually corrupted — for
a benefit nobody has asked for yet.

### 13.5 Cache

`cached_network_image` (added; 14 transitive packages including `sqflite`).
Images are served with `Cache-Control: public, max-age=2592000, immutable`,
which is correct because filenames are UUIDs and content never changes under a
name. A replaced image is a new upload with a new UUID, so the header keeps
telling the truth.

Splash calls `refresh()` then `prefetch()`. Prefetch downloads **only the
currently selected image per slot**, not every image in every slot: a slot with
four characters shows one today, and fetching the other three spends the
customer's mobile data on images nobody will see before tomorrow.

Neither call blocks startup — `unawaited(...)`, exactly as
`StoreSettingsRepository.refresh()` already is.

### 13.6 Admin usage

1. Open **التسويق → رسوم الشخصيات**.
2. Expand the group you want (المصادقة, التسوّق, …) and find the slot by its
   location description — no Flutter filenames needed. **فتحة جديدة** exists for
   adding a slot that a future app version introduces.
3. Open the slot with **إدارة الصور**.
4. **رفع صورة جديدة** — uploads and attaches in one step.
5. Toggle each image active/inactive; reorder with the arrows.
6. Choose **ثابتة** or **يومية**. Changes save immediately.
7. The app picks it up on its next launch.

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
