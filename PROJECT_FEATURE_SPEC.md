# PROJECT_FEATURE_SPEC — Otaku Galaxy (مجرة الأوتاكو)

**Functional source of truth.** Audit-only document. No application code, migration, test, or
design file was modified while producing it.

- **Audit date:** 2026-08-24
- **Repo:** `/home/ameer/otaku_galaxy` — branch `master`, HEAD `a08f924`
- **Working tree:** dirty (large uncommitted change set; audit describes the *working tree*, not HEAD)
- **Visual source of truth read:** `/home/ameer/Videos/Otaku Galaxy v2.dc.html` (358,769 bytes, 28 screen states, 46 section blocks) — inspected via text/label/state extraction
- **Backend tests executed:** `npm test` in `backend/` → **10 files, 115 tests, all passing** (live PostgreSQL) — *re-run 2026-08-25; the original audit run was 9 files / 73 tests*
- **Flutter tests executed:** `flutter test` → **276 tests, 275 passing, 1 failing** (`test/api_integration_test.dart` — pre-existing, see §1.6) — *re-run 2026-08-25*
- **Latest full audit:** 2026-08-25 — see **§17 CURRENT IMPLEMENTATION AUDIT** at the end of this document, which supersedes any older status claim in §1–§15 where they disagree.

> ⚠️ **Snapshot caveat.** Files were being edited by another process concurrently while this audit
> ran (mtimes of 2026-08-24 06:24–06:32 on `cart_state.dart`, `order_data_screen.dart`,
> `order_data.dart`, `product.dart`, `order.dart`, and a **new** `test/business_rules_test.dart`
> created at 06:32). Every claim below was re-verified against file contents at the time of writing;
> the five load-bearing findings were re-confirmed by grep immediately before publishing. The
> specific in-flight area (delivery-promo preview) is called out explicitly in §6-E and §7.4.
>
> **Test counts are as-of the run**, not as-of now: `flutter test` executed at ~06:29, before
> `test/business_rules_test.dart` existed, so that file is **not** included in the 218/217/1 figures
> and is **not** reflected in the §11 coverage matrix.

---

## Status vocabulary

| Marker | Meaning |
|---|---|
| `COMPLETE` | Traced end-to-end through real code: UI → state → repo → HTTP → controller → service → repo → SQL, and covered by a test |
| `PARTIAL` | Chain exists but a link is incomplete, or a sub-capability is absent |
| `PARTIAL — UI EXISTS / FUNCTIONALITY MISSING` | Widget renders; no working data path behind it |
| `BACKEND EXISTS / UI MISSING` | Server capability with no client that reaches it |
| `BROKEN INTEGRATION` | Client reads a path/field the server does not serve |
| `ORPHANED API` | Endpoint exists, is reachable, and nobody calls it |
| `UNUSED DATA MODEL` | Column/table written or defined but never read by any UI |
| `MISSING` | Absent from the codebase entirely |
| `UI ONLY` | Values are hardcoded in the client with no server origin |

**Priorities:** `P0` security / financial / data corruption / core auth · `P1` core customer
functionality · `P2` important feature · `P3` polish / optional.

---

# STEP 1 — PROJECT INVENTORY

## 1.1 Repository shape

| Area | Path | Files | Stack |
|---|---|---|---|
| Flutter app (customer) | `lib/` | 182 `.dart` | Flutter, `flutter_bloc` (Cubit), `auto_route`, `get_it`, `dio`, `flutter_secure_storage`, `shared_preferences` |
| Backend API | `backend/src/` | 66 `.ts` | Node + Express 5, TypeScript ESM, `pg` (raw SQL, no ORM), `zod`, `jsonwebtoken`, `bcryptjs`, `multer`, `helmet`, `express-rate-limit` |
| Admin dashboard | `admin/src/` | 52 `.ts/.tsx` | React + Vite, Ant Design, TanStack Query, Zustand, axios |
| Migrations | `backend/src/database/migrations/` | 19 `.sql` | Plain SQL, applied by `backend/scripts/migrate.ts` |
| Backend tests | `backend/tests/` | 9 `.test.ts` + 2 helpers | Vitest + supertest against a real test DB |
| Flutter tests | `test/` | 11 `.dart` | `flutter_test`, incl. live-server integration tests |
| Design source | `/home/ameer/Videos/Otaku Galaxy v2.dc.html` | 1 | Design-canvas prototype (Arabic + Sorani Kurdish) |

There is **no `CLAUDE.md`** anywhere in the repository.

## 1.2 Flutter inventory

**Routes** — `lib/core/router/app_router.dart` (auto_route, generated `app_router.gr.dart`):

| Path | Page | Guard |
|---|---|---|
| `/` | `SplashRoute` (initial, `keepHistory:false`) | — |
| `/onboarding` | `OnboardingRoute` | — |
| `/login`, `/register`, `/forgot-password`, `/otp`, `/reset-password` | auth screens | — (deliberately ungated) |
| `/main` → `home`, `categories`, `cart`, `account` | `MainNavigationRoute` shell | — |
| `/search`, `/category-products/:categoryId`, `/product/:productId` | browse | — (guest allowed) |
| `/favorites`, `/personalize`, `/community` | | — (in-screen guest prompt) |
| `/order-data`, `/order-review`, `/orders`, `/order-detail/:orderId` | checkout & orders | `AuthGuard` |
| `/settings`, `/notifications`, `/galaxy-points` | account | `AuthGuard` |
| `/rate-order`, `/review-submitted`, `/write-review` | reviews | `AuthGuard` |
| `/collection/:collectionId` | collections | `AuthGuard` |

`AuthGuard` (`lib/core/router/guards/auth_guard.dart`) resolves `next(false)` then pushes
`LoginRoute` — it does **not** leave the navigation pending.

**Bottom navigation** is 5 tabs via `IndexedStack` in
`lib/features/main_navigation/presentation/screens/main_navigation_screen.dart`
(`MainTab.community = 2`, rendered as the raised centre tab) even though the router declares only 4
`/main` children. Community is therefore reachable both as a tab and as `/community`.

**Cubits / Blocs** (all `registerLazySingleton` in `lib/core/di/injection_container.dart`):
`AuthCubit`, `CartCubit`, `FavoritesCubit`, `ThemeCubit`, `LocaleCubit`, `ReviewsCubit`,
`PointsCubit`, `NotificationsCubit`, `CollectionsCubit`.

**Repositories (interfaces → implementations):**

| Domain interface | Implementation | Transport |
|---|---|---|
| `AuthRepository` | `AuthRepositoryImpl` | HTTP |
| `ProductRepository` | `ProductRepositoryImpl` | HTTP |
| `GovernorateRepository` | `GovernorateRepositoryImpl` | HTTP |
| `OrderRepository` | `OrderRepositoryImpl` | HTTP |
| `CartRepository` | `CartRepositoryImpl` | HTTP |
| `FavoritesRepository` | `FavoritesRepositoryImpl` | HTTP |
| `ReviewRepository` | `ApiReviewRepository` | HTTP |
| `PointsRepository` | `ApiPointsRepository` | HTTP |
| `NotificationRepository` | `ApiNotificationRepository` | HTTP |
| `CollectionRepository` | `ApiCollectionRepository` | HTTP |
| — | `BirthdayStorage` | HTTP (server-backed, sync getters over a cached snapshot) |
| — | `StoreSettingsRepository` | HTTP (cached) |
| — | `OnboardingStorage`, `PersonalizeStorage`, `NotificationPrefsStorage`, `SearchHistoryStorage` | `SharedPreferences` |
| — | `AuthLocalStorage` | `FlutterSecureStorage` |

There are **no local/mock repository implementations left** — every domain repository is HTTP-backed.

**Use cases** (thin, 1 method each): `Login`, `Register`, `SendOtp`, `ForgotPassword`, `VerifyOtp`,
`ResetPassword`, `GetMe`, `UpdateProfile`, `ChangePassword`, `FetchHome`, `FetchProducts`,
`FetchCategories`, `FetchCategoryProducts`, `SearchProducts`, `FetchProductDetails`,
`FetchGovernorates`, `PlaceOrder`, `FetchMyOrders`, `FetchOrderDetails`.

**Entities:** `User`, `AuthSession`, `Product`/`ProductOption`, `Category`, `Banner`, `Governorate`,
`DeliveryZone`, `HomeData`, `ProductPage`, `ProductSort`, `CartItem`, `Order`/`OrderStatus`,
`OrderData`, `Review`, `PointsActivity`, `OtakuLevel`, `Collection`, `AppNotification`.

**API client** — `lib/core/network/api_client.dart`: single Dio instance, injects
`Authorization: Bearer` from `AuthLocalStorage.token`, unwraps the uniform
`{ success, data, message, error:{code} }` envelope, calls `AuthCubit.forceLogout()` on 401, exposes
`uploadFile()` (multipart) and `probeHealth()`.

**Base URL** — `lib/core/config/app_config.dart`: `--dart-define=API_BASE_URL` override →
per-environment explicit URL → dev default (`http://10.0.2.2:4000/api` on Android, else
`http://localhost:4000/api`). Staging/production both point at the placeholder
`https://api.otaku-galaxy.example/api`.

**Theme** — `lib/core/design_system/`: tokens (`app_colors`, `app_dimens`, `app_theme_colors`),
`AppTheme.light`/`AppTheme.dark`, and ~40 reusable components under `components/`.

**Localization** — `lib/core/l10n/app_strings.dart`: Arabic + Sorani Kurdish (`ckb`), **18 keys
only** (nav labels + a handful of shared titles). All other UI text is hardcoded Arabic.

## 1.3 Backend inventory

**Composition** — `backend/src/app.ts`:
`helmet` (with `crossOriginResourcePolicy: cross-origin` so images load from another origin) → `cors`
(`config.corsOrigins`) → `express.json({limit:'1mb'})` → global rate limiter → `GET /health` →
`express.static` for `/uploads` → `/api/auth` → `/api/catalog` → `/api` (authenticated customer) →
`/api/admin` (authenticate + requireAdmin) → 404 handler → error handler.

**Route files:** `routes/auth.ts`, `routes/catalog.ts`, `routes/customer.ts`, `routes/admin.ts`.

**Controllers:** `authController`, `catalogController`, `cartController`, `favoritesController`,
`orderController`, `communityController`, `mediaController`, `publicExtrasController`,
`adminController`, `adminExtrasController`.

**Services:** `authService`, `otpService`, `catalogService`, `cartService`, `orderService`,
`favoritesService`, `reviewsService`, `pointsService`, `birthdayService`, `collectionsService`,
`notificationsService`, `mediaService`, `settingsService`, `franchisesService`, `adminService`.

**Repositories:** `userRepo`, `verificationRepo`, `catalogRepo` (`productRepo`/`categoryRepo`/
`subcategoryRepo`), `storefrontRepo` (`bannerRepo`/`governorateRepo`), `cartRepo`, `favoritesRepo`,
`orderRepo`, `reviewsRepo`, `pointsRepo`, `birthdayRepo`, `collectionsRepo`, `notificationsRepo`,
`franchisesRepo`, `zonesRepo`, `settingsRepo`, `mediaRepo`, `statsRepo`.

**Validators (zod):** `auth.ts`, `catalog.ts`, `cart.ts`, `orders.ts`, `community.ts`,
`franchises.ts`, `admin.ts`. `utils/zod.ts#parse` converts any failure into a uniform
`400 VALIDATION_ERROR`.

**Middleware:** `auth.ts` (`authenticate`, `requireAdmin`), `error-handler.ts` (`errorHandler`,
`notFoundHandler`, `authRateLimiter`, `globalRateLimiter`), `upload.ts` (multer memory storage,
5 MB, 1 file, MIME allow-list).

**Storage** — `storage/index.ts`: `StorageDriver` interface + `LocalDiskStorage` writing to
`uploads/<purpose>/<YYYY>/<MM>/<uuid><ext>`, plus `sniffImageMime()` magic-byte validation
(JPEG `FF D8 FF`, PNG 8-byte signature, RIFF/WEBP).

**Transactions** — `database/pool.ts#withTransaction`: BEGIN/COMMIT/ROLLBACK with guaranteed
`client.release()`.

## 1.4 Database inventory (19 migrations)

| # | Migration | Tables / objects created |
|---|---|---|
| 001 | `users` | `users`, `verification_codes`, `idx_users_phone`, `idx_verification_codes_phone_purpose` |
| 002 | `categories` | `categories`, `subcategories`, `idx_subcategories_category` |
| 003 | `products` | `products`, `product_images`, `product_options` + 4 partial indexes |
| 004 | `storefront` | `banners`, `governorates` + partial indexes |
| 005 | `favorites_cart` | `favorites`, `carts`, `cart_items` |
| 006 | `orders` | `order_number_seq`, `orders`, `order_items`, `order_status_history` |
| 007 | `search_and_triggers` | `pg_trgm`, GIN + `text_pattern_ops` indexes on `products.name`, `set_updated_at()` + 7 triggers |
| 008 | `orders_item_image` | `order_items.image_url` |
| 009 | `reviews` | `reviews` + 4 indexes, `refresh_product_rating()`, `reviews_sync_product_rating()` trigger |
| 010 | `points` | `points_ledger` + 2 unique partial indexes (duplicate-award guards) |
| 011 | `collections` | `collections`, `collection_products` |
| 012 | `notifications` | `notifications` + 2 indexes |
| 013 | `birthday` | `users.birth_day/birth_month/birthday_set_at` + pair CHECK, `birthday_discount_usage` (UNIQUE `user_id, used_year`) |
| 014 | `franchises` | `franchises`, `product_franchises` |
| 015 | `delivery_zones` | `governorate_zones`, `orders.zone_id`, `orders.zone_name`, Najaf default zones |
| 016 | `promotions` | `products.previous_price`, `products.has_delivery_promo`, CHECK `previous_price > price`, `product_discount_percent()` |
| 017 | `store_settings` | `store_settings` k/v + 3 social seeds |
| 018 | `media` | `media_files` (purpose CHECK: product/review/avatar/banner/franchise) |
| 019 | `delivery_promo_amount` | `products.delivery_promo_amount` + consistency CHECK, `orders.delivery_discount` + `delivery_discount <= delivery_fee` CHECK |
| 020 | `delivery_and_rating_window` | `orders.delivered_at`, `orders.rating_available_at`, `orders.rating_reminder_sent_at` + 3 CHECKs, backfill of historical COMPLETED orders, `idx_orders_rating_reminder_due` |
| 021 | `relative_media_urls` | **Data normalisation only, no schema change.** `media_ref_to_relative()` helper + rewrite of 8 media columns from absolute to relative refs |
| 022 | `rating_window_anchored_to_dispatch` | `orders.dispatched_at`; drops `orders_rating_window_pair` + `orders_rating_after_delivery`; adds `orders_rating_after_dispatch`; backfills `dispatched_at` from history and re-anchors unsent windows |
| 023 | `media_category_purpose` | Adds `'category'` to the `media_files.purpose` CHECK + relabels category uploads previously filed as `banner` |

**Table count:** 24 tables + 1 sequence + 4 functions + 9 triggers. **23 migrations applied** (verified against `schema_migrations` on 2026-08-25).

## 1.5 Admin dashboard inventory

15 routes in `admin/src/App.tsx`, all lazy-loaded behind `ProtectedRoute` + `AppLayout`:
`/login`, `/` (DashboardHome), `/orders`, `/orders/:id`, `/products`, `/products/new`,
`/products/:id/edit`, `/categories`, `/banners`, `/governorates`, `/customers`, `/offers`,
`/reviews`, `/franchises`, `/zones`, `/settings`.

API modules: `authApi`, `productsApi`, `categoriesApi`, `bannersApi`, `governoratesApi`,
`ordersApi`, `customersApi`, `communityApi` (stats + reviews + franchises + zones + settings),
`uploadsApi`.

Shared components: `ProtectedRoute`, `AppLayout` + `nav`, `ProductForm`, `ImagesEditor`,
`ImageUploadField`, `OptionsEditor`, `StatusTransitionButtons`, `StatusBadge`, `EmptyState`,
`PageLoader`, `PagePlaceholder`.

## 1.6 Test inventory

| Suite | File | Tests | Result |
|---|---|---|---|
| Auth | `backend/tests/auth.test.ts` | 10 | ✅ |
| Catalog + promotions + sorting | `backend/tests/catalog.test.ts` | 13 | ✅ |
| Cart + orders | `backend/tests/orders.test.ts` | 4 | ✅ |
| Admin PATCH integrity + stock on rejection | `backend/tests/admin-integrity.test.ts` | 9 | ✅ |
| Reviews, points, collections, notifications, birthday, zones | `backend/tests/community.test.ts` | 12 | ✅ |
| Community category filter | `backend/tests/community-filter.test.ts` | 6 | ✅ |
| Confirm receipt | `backend/tests/confirm-receipt.test.ts` | 7 | ✅ |
| Delivery promo | `backend/tests/delivery-promo.test.ts` | 8 | ✅ |
| Media upload | `backend/tests/media.test.ts` | 5 | ✅ |
| **Backend total** | | **73** | **✅ all pass** |
| Flutter — design-system smoke, config, DI wiring, session restore, preferences, personalize, header contrast, network failure states, profile contract, widget | `test/*.dart` | 217 | ✅ |
| Flutter — onboarding screen (v2 reconstruction) | `test/onboarding_screen_test.dart` | 11 | ✅ |
| Flutter — live-server integration | `test/api_integration_test.dart` | 1 of them | ❌ **FAILS** |
| Flutter — *added after the run* | `test/business_rules_test.dart` (created 06:32) | not run | ⚠️ **unmeasured by this audit** |

**Known failure (verified, reproduced twice):**
`test/api_integration_test.dart` → *«أقسام الإكسسوارات والحقائب: تحميل منتجاتها ومجموعاتها الفرعية»*
`Expected: non-empty / Actual: []` — «المجموعة الفرعية "ميداليات" في القسم "إكسسوارات" يجب أن تحتوي منتجات».
The test asserts *every* subcategory of «إكسسوارات»/«حقائب» contains at least one product. The
subcategory «ميداليات» exists in the running dev database but is not in `backend/scripts/seed.ts`
(which defines only `سلاسل, خواتم, بروشات` for that category). This is a **data-state failure, not a
code defect** — but it means the Flutter suite is not hermetic: `api_integration_test.dart` requires
a live backend on `localhost:4000` plus specific mutable DB content.

---

# STEP 2 & 3 — FEATURE INVENTORY, TRACED THROUGH THE STACK

Each feature below was traced by reading the actual files named. Anything not traced is marked as
such.

## 2.1 AUTHENTICATION

### Registration + OTP verification — `COMPLETE` *(verification is now a real gate, 2026-08-25)*
```
register_screen.dart → AuthCubit.register → RegisterUsecase → AuthRepositoryImpl.register
  → POST /api/auth/register → authController.register → registerSchema
  → authService.register → userRepo.create (INSERT users, phone_verified_at = NULL)
                          + otpService.sendVerificationCode
  → verificationRepo.create (INSERT verification_codes, bcrypt-hashed code, TTL from config)
otp_verification_screen.dart → AuthCubit.verifyOtp → VerifyOtpUsecase → verifyOtp
  → POST /api/auth/verify → authService.verifyRegistration → otpService.verifyCode
  → UPDATE users SET phone_verified_at = now()   ← the account becomes verified HERE, only here
  → returns { token, user } → AuthCubit._saveSession → AuthLocalStorage (secure storage)
```
Verification **returns a live session** (`authService.verifyRegistration` signs a JWT), so the user
is authenticated immediately after verifying — no second login step.

**Abandoned registrations are resumable.** A row with `phone_verified_at IS NULL` is a *pending*
registration, not a taken number: re-registering the same phone updates the username/password,
bumps `token_version`, and issues a fresh code. Only a **verified** phone returns `409 PHONE_TAKEN`.
Before this, a user whose SMS was delayed or who closed the app mid-signup was locked out of that
number permanently — the single most common "I cannot create an account" report.
Tests: `auth.test.ts` «registration → OTP verification → login → me», «registration ends
authenticated / verify returns a working session», «a wrong code does not produce a session».

### Login — `COMPLETE` *(verification gate added 2026-08-25)*
`login_screen.dart` → `AuthCubit.login` → `POST /api/auth/login` → `authService.login`
(`bcrypt.compare` → `is_active` → `phone_verified_at`) → `{token, user}`. Admin dashboard uses the
same endpoint via `admin/src/api/authApi.ts#login`. Tested.

Order matters: the password is checked **before** the active/verified checks, so neither state
leaks to someone who does not already know the password. An unverified account is refused with
`403 PHONE_NOT_VERIFIED` and a fresh code is sent; the Flutter login screen reads that code and
pushes `OtpVerificationRoute` instead of showing a dead-end error.

### Session persistence + restore — `COMPLETE`
`AuthLocalStorage` (`flutter_secure_storage`) holds `auth_token` + `auth_user`. `AuthCubit.loadSession()`
calls `GET /auth/me`; **only an explicit 401 clears the session** — network failure falls back to the
cached user (`_restoreCachedUser`). Covered by `test/auth_session_restore_test.dart`.

### Logout — `COMPLETE`
`account_screen.dart:419` → `AuthCubit.logout()` → `forceLogout()` → secure storage cleared →
`AuthUnauthenticated`. `lib/app/view/app.dart:88-95` then clears **all** per-account state:
`CartCubit`, `FavoritesCubit`, `BirthdayStorage`, `PointsCubit`, `NotificationsCubit`,
`CollectionsCubit`, `ReviewsCubit`.

### Forgot / reset password — `COMPLETE`
`forgot_password_screen` → `POST /auth/forgot-password` (purpose `password_reset`) →
`reset_password_screen` → `POST /auth/reset-password` → `verifyCode` + `bcrypt.hash` +
`userRepo.update`. Tested («password reset via OTP»).

### Change password (settings) — `COMPLETE`
`settings_screen` → `AuthCubit.changePassword` → `PATCH /auth/me/password` →
`authService.changePassword` verifies the current password, no OTP. Tested (2 cases).

### Change username / avatar — `COMPLETE`
`PATCH /auth/me` with `updateProfileSchema`. `AuthRepositoryImpl.updateProfile` builds the body
explicitly so an *absent* key means "unchanged" and an explicit `null` means "clear the avatar".
Covered by `test/profile_update_contract_test.dart`.

### Guest mode — `COMPLETE`
Home/categories/search/product-detail/community/favorites/personalize are reachable without a
session; each account-scoped screen renders `AnimeGuestPrompt` in place of content
(`cart_screen.dart`, `favorites_screen.dart`, `account_screen.dart`). Ordering, orders, settings,
notifications, points, reviews, collections are `AuthGuard`-protected.

### Unauthorized handling — `COMPLETE`
Two layers: Dio `onError` interceptor **and** `_unwrap`/`_request` both call `onUnauthorized` →
`AuthCubit.forceLogout()`. Backend `notFoundHandler` + `errorHandler` never leak internals
(`500 → { code: 'INTERNAL_ERROR' }`).

**OTP delivery — `PROVIDER-READY / NOT YET CONNECTED TO A REAL CARRIER`** (see §19.3).
`otpService.sendVerificationCode` now generates a cryptographically secure random code and hands it
to a `SmsProvider` behind `backend/src/services/sms/index.ts`. The `http` provider is implemented
and verified against a real local HTTP server (headers, body shape, failure surfacing). **No real
carrier account has been connected or tested** — that requires the credentials listed in §19.3.

## 2.2 PERSONALIZATION

| Sub-feature | Trace | Status |
|---|---|---|
| Theme (light/dark) | `personalize_screen` / `settings_screen` → `ThemeCubit` → `SharedPreferences` → `MaterialApp.themeMode` | `COMPLETE` (device-local by design) |
| Language (ar / ckb) | `LocaleCubit` → `SharedPreferences` key `app_language_code` → `MaterialApp.locale` | `PARTIAL` |
| RTL | Both `ar` and `ckb` are RTL; `app.dart` keeps direction fixed and comments this explicitly | `COMPLETE` |
| Personalize screen | `/personalize`, ungated (device prefs, not account data) | `COMPLETE` |
| Persistence after restart | `ThemeCubit.loadPreference()` + `LocaleCubit.loadPreference()` called in `injection_container.init()` | `COMPLETE` — covered by `test/preferences_persistence_test.dart` and `test/personalize_screen_test.dart` |

**Language is `PARTIAL`:** `AppStrings` (`lib/core/l10n/app_strings.dart`) contains **18 keys**. Every
other string in all 182 Dart files is hardcoded Arabic. Selecting Kurdish translates the bottom nav
and a few titles; the rest of the app stays Arabic. The file documents this deliberately. No
`intl`/ARB pipeline exists.

## 2.3 CUSTOMER PROFILE

```
account_screen.dart
  ├─ name/avatar → AuthCubit.updateProfile → PATCH /auth/me → users.username / users.avatar_url
  ├─ avatar upload → ImagePicker(gallery) → ApiClient.uploadFile('/uploads', purpose:'avatar')
  │    → POST /api/uploads → mediaController.upload → mediaService.upload
  │    → sniffImageMime + storage.save → INSERT media_files → returns { id, url }
  ├─ points card → PointsCubit → GET /points
  ├─ birthday row → BirthdayStorage → GET/POST /birthday
  └─ social rows → StoreSettingsRepository → GET /catalog/settings → store_settings
```
Status: `COMPLETE` — with two deliberate deviations from the design (§5): **camera capture is
removed on purpose** (`account_screen.dart:340` — «الالتقاط بالكاميرا مُزال عمداً»), and the design's
**AVATAR CROP** screen is `MISSING` (only `ImagePicker(maxWidth:1024, imageQuality:85)`).

## 2.4 CATALOG

| Sub-feature | Endpoint | Backend | Status |
|---|---|---|---|
| Home aggregate | `GET /catalog/home` | `catalogService.getHome` → banners + offers + selected + categories + stable-random `discover` (`ORDER BY md5(id\|\|'home')`) | `COMPLETE` |
| Product list | `GET /catalog/products` | `productRepo.list` | `COMPLETE` |
| Categories + subcategories | `GET /catalog/categories` | `categoryRepo.list` (LEFT JOIN + `json_agg … FILTER`) | `COMPLETE` |
| Product detail | `GET /catalog/products/:id` | inline SQL in `catalogService.productDetail` | `PARTIAL` (see below) |
| Product images | `product_images` sorted by `sort_order` | | `COMPLETE` |
| Stock | `products.stock`, shown via `ProductStockPill`, `Product.lowStock` (≤3) | | `COMPLETE` |
| Price / previous price / discount % | `previous_price` + server-computed `discountPercent` | CHECK `previous_price > price` | `COMPLETE` |
| Offers / selected flags | `is_offer`/`is_selected` + `offer_rank`/`selected_rank` | | `COMPLETE` |
| Ratings | `products.rating` + `review_count`, maintained by the `trg_reviews_sync_rating` trigger from **approved** reviews only | | `COMPLETE` |
| Search | `GET /catalog/products/search` | `productRepo.search` — ILIKE, `pg_trgm` GIN index | `COMPLETE` |
| Recent searches | `SearchHistoryStorage` (SharedPreferences) | — | `COMPLETE` (device-local) |
| "Suggested" search chips | hardcoded list `search_screen.dart:37` | — | `UI ONLY` |
| Sorting | `?sort=` closed enum → fixed `ORDER BY` map in `catalogRepo.SORT_CLAUSES` | | `COMPLETE` — 4 sorting tests |
| Filtering | `categoryId`, `subcategoryId`, `offer`, `selected` | | `COMPLETE` |
| Empty / error / loading states | `AnimeEmptyState`, `AnimeErrorState`, `OtakuSkeleton`, `AnimeLoader` | | `COMPLETE` — `test/network_failure_states_test.dart` |

**`PARTIAL` on product detail and home-discover:** `catalogService.productDetail` (line 146) and the
`discover` mapper (line 62) both emit `hasDeliveryPromo` but **not** `deliveryPromoAmount`, while
`catalogRepo.mapProduct` (used by `/catalog/products`) *does*. Consequence traced into the UI:
`anime_product_card.dart:227-232` returns `null` for the promo label when `amount <= 0`, so the
delivery-promo line silently disappears on discover cards; `product_detail_screen.dart:338` falls
back to the amount-free sentence «هذا المنتج ضمن عرض التوصيل المميّز». The backend test
`catalog.test.ts` «promotion fields are exposed consistently» passes because its `PROMO_KEYS` array
lists only `previousPrice, discountPercent, hasDeliveryPromo, franchiseIds` — `deliveryPromoAmount`
is not asserted.

## 2.5 CART — `COMPLETE` *(delivery-promo chain closed 2026-08-24)*

```
cart_screen.dart → CartCubit(add/increase/decrease/remove/load) → CartRepositoryImpl
  → GET/POST /cart, PATCH/DELETE /cart/:id
  → cartController → cartService → cartRepo (ensureCart upsert, UNIQUE(cart_id,product_id,option_value))
  → carts / cart_items
```
- Add/remove/quantity/merge: `COMPLETE` (`cartRepo.upsertItem` uses `ON CONFLICT … quantity + EXCLUDED.quantity`).
- Stock validation: `COMPLETE` — enforced server-side in `cartService.addItem` (checks the *merged*
  total) and `cartService.updateQuantity`; the client additionally hides "+" at `stock`.
- Totals: `COMPLETE` for the products subtotal (`CartState.total`).
- Delivery fee in cart: intentionally deferred — the cart shows «يُحتسب عند إدخال العنوان».
- **Delivery discount in cart: `COMPLETE` since 2026-08-24.** `cartRepo.LINE_SELECT` now also
  selects `p.has_delivery_promo` and `p.delivery_promo_amount`; `CartLine` carries them and
  `CartRepositoryImpl._mapLine` maps them onto the `Product`. `CartState.deliveryPromoTotal` /
  `deliveryDiscountFor(fee)` therefore produce a real figure, and the checkout preview matches what
  the server charges. Regression test: `order-rating-lifecycle.test.ts` «cart lines carry the
  delivery promo fields the checkout preview needs» (asserts both the on and off states).

## 2.6 FAVORITES — `COMPLETE` *(B-1 fixed 2026-08-25)*

```
favorites_screen.dart / favorite_toggle.dart → FavoritesCubit → FavoritesRepositoryImpl
  → GET /favorites?page&limit · POST /favorites {productId} · DELETE /favorites/:productId
  → favoritesController → favoritesService → favoriteRepo
  → favorites (UNIQUE(user_id, product_id), ON CONFLICT DO NOTHING, idx_favorites_user)
```
Add / remove / list / empty state / guest prompt: all traced and working. Tested
(`orders.test.ts` «favorites: add → list → remove»).

**`FIXED` (B-1).** `shapeProductImages` is deleted. `favoriteRepo.list` now selects through
`SELECT_WITH_IMAGES` and maps with the canonical `catalogRepo.mapProduct`, so Favorites returns the
identical product contract as every other surface — including `previousPrice`, `discountPercent`,
`hasDeliveryPromo`, `deliveryPromoAmount`, `isActive` and `franchiseIds`. See §20.

## 2.7 COLLECTIONS — `COMPLETE`

```
favorites_screen (tab "مجموعاتي") → collections_tab.dart / collection_detail_screen.dart
  / add_to_collection_sheet.dart (opened from product_detail_screen.dart:417)
  → CollectionsCubit → ApiCollectionRepository
  → GET/POST /collections · PATCH/DELETE /collections/:id
    · POST /collections/:id/products · DELETE /collections/:id/products/:productId
  → communityController → collectionsService → collectionRepo
  → collections (UNIQUE(user_id,name), CHECK length 1..60) + collection_products (PK composite)
```
Ownership is re-checked server-side before every mutation (`collectionRepo.findOwned`, and the
`rename`/`remove` SQL is itself scoped by `user_id`). Cap: 50 collections/user
(`MAX_COLLECTIONS_PER_USER`). Duplicate names rejected with `COLLECTION_NAME_TAKEN`.
Tested: `community.test.ts` «creates, renames, adds products and blocks other users».

## 2.8 ORDERS — `PARTIAL`

**Creation** (`orderService.create`, one transaction):
1. Validate governorate is active.
2. Load zones; if any exist the zone is **mandatory** (`ZONE_REQUIRED`) and its fee replaces the
   governorate fee; if none exist, sending a `zoneId` is rejected (`ZONE_NOT_SUPPORTED`).
3. Read the cart server-side; empty cart → 400.
4. Per line: re-read the product, reject if inactive/insufficient stock, snapshot
   `productId/name/image/option/price/quantity/lineTotal`, accumulate `deliveryPromoTotal`.
5. `deliveryDiscount = min(deliveryPromoTotal, deliveryFee)`.
6. Birthday discount = `round(productsTotal * 5 / 100)` **only if** `birthdayRepo.status().rewardAvailable`.
7. `orderRepo.create` → `nextval('order_number_seq')`, INSERT `orders`, INSERT `order_items`,
   `UPDATE products SET stock = stock - qty WHERE id = ? AND stock >= ?`, INSERT initial
   `order_status_history`.
8. If a birthday discount was applied, `birthdayRepo.consume` must succeed or the **whole order rolls
   back** (`BIRTHDAY_DISCOUNT_USED`).
9. `cartRepo.clear`.

**Lifecycle** — `ORDER_STATUS_TRANSITIONS` in `backend/src/types/index.ts`:
`PENDING_ADMIN_CONFIRMATION → {CONFIRMED, REJECTED}`, `CONFIRMED → {PREPARING, REJECTED}`,
`PREPARING → {OUT_FOR_DELIVERY, REJECTED}`, `OUT_FOR_DELIVERY → {COMPLETED, REJECTED}`,
`COMPLETED → {}`, `REJECTED → {}`.
Both the admin path and the customer's confirm-receipt path funnel through the single
`applyStatusTransition()` function, so stock restore, points award, notification, and history are
written exactly once, in one transaction.

| Sub-feature | Status | Evidence |
|---|---|---|
| Create order | `COMPLETE` | `orders.test.ts`, `delivery-promo.test.ts` |
| Status transitions + invalid-transition rejection | `COMPLETE` | `orders.test.ts` «admin walks order through statuses and rejects invalid transition» |
| Rejection restores stock, exactly once | `COMPLETE` | `admin-integrity.test.ts` (3 cases) |
| Rejection reason mandatory | `COMPLETE` | `REJECTION_REASON_REQUIRED`, zod `.refine` |
| Receipt confirmation | `COMPLETE` | `confirm-receipt.test.ts` (7 cases) |
| Order history / list | `COMPLETE` | `GET /orders` + `statusCounts` |
| Order details | `COMPLETE` | `GET /orders/:id`, ownership → 403 |
| ETA | `PARTIAL` | Stored as the `OUT_FOR_DELIVERY` history note, surfaced as `deliveryNote`; admin picks from 4 hardcoded presets in `StatusTransitionButtons.tsx` |
| **Customer cancellation** | **`ORPHANED API`** | `POST /orders/:id/cancel` is fully implemented and tested (`admin-integrity.test.ts` «customer cancellation restores stock atomically, second cancel refused») but **no Flutter code calls it**. `ApiEndpoints.cancelOrder` (`api_endpoints.dart:31`) is declared and never referenced; `OrderRepository` has no `cancelOrder` method. |
| **Status history timeline** | **`COMPLETE`** *(2026-08-24)* | `orderRepo` now returns `statusHistory: [{status, note, createdAt}]` on every order read, deliberately **without** `changed_by` so the customer never sees which admin acted. `Order.statusHistory` parses it and `_OrderJourney._timeFor()` stamps each step with the server's real time. Admin gets the same array as an antd `Timeline`. Test: «exposes a timestamped status history without leaking who changed it». |
| **Delivery timestamp** | **`COMPLETE`** *(2026-08-24)* | `orders.delivered_at` set once on the first transition into `COMPLETED` (`orderRepo.markDelivered`, guarded by `delivered_at IS NULL`). Test: «does not move the rating window when COMPLETED is re-applied». |
| **Rating window** | **`COMPLETE`** *(2026-08-24)* | `orders.rating_available_at = delivered_at + config.orders.ratingDelayHours` (default 24 h). See §2.13 and §16. |

## 2.9 CHECKOUT — `PARTIAL`

```
cart_screen → OrderDataRoute (order_data_screen.dart, AuthGuard)
   ├─ governorates: FetchGovernoratesUsecase → GET /catalog/governorates
   ├─ zones: FetchGovernoratesUsecase.zones → GET /catalog/governorates/:id/zones
   ├─ address + phone (validated locally, re-validated by createOrderSchema)
   ├─ BirthdayDiscountCard (preview only)
   └─ summary: subtotal + (deliveryCost − deliveryDiscount) − birthdayDiscount
→ OrderReviewRoute (order_review_screen.dart) → PlaceOrderUsecase → OrderRepositoryImpl.placeOrder
→ POST /api/orders  body = { governorateId, fullAddress, phone, zoneId? }   ← totals NOT sent
→ OrderSuccessView
```
- Zone gating is real: `_zoneMissing` blocks `_continue()`, and no delivery figure is shown for a
  zoned governorate until a zone is picked.
- `OrderData.toJson()` deliberately sends **only** `governorateId, fullAddress, phone, zoneId` — no
  prices, no totals, no discount. Server is authoritative. Verified by `delivery-promo.test.ts`
  «ignores a discount or total forged by the client».
- **`PARTIAL` #1 — no customer name field.** The design's checkout has «الاسم الكامل»
  (`t.fullName`). Neither `order_data_screen.dart` nor `createOrderSchema` has a name field; the
  order's customer name comes from `users.username` via the `ORDER_WITH_CUSTOMER` join.
- **`PARTIAL` #2 — the two checkout screens disagree.** `order_data_screen.dart:175-178` now
  subtracts `deliveryDiscount`; `order_review_screen.dart:246` computes the products line as
  `data.total - data.deliveryCost` and prints `data.deliveryCost` un-discounted. Since
  `OrderData.total` now uses `payableDelivery`, the review screen's "سعر المنتجات" row is
  `productsTotal − deliveryDiscount − birthdayDiscount`, i.e. wrong whenever either discount is
  non-zero. (Moot today because the preview is always 0 — see §7.4 — but it becomes visible the
  moment the cart payload is fixed.)

## 2.10 DELIVERY PROMOTION — `PARTIAL`

| Layer | State | Evidence |
|---|---|---|
| DB | `COMPLETE` | `products.has_delivery_promo`, `products.delivery_promo_amount` + CHECK forcing "enabled ⇔ amount > 0"; `orders.delivery_discount` + CHECK `<= delivery_fee` (migration 019) |
| Admin config | `COMPLETE` | `ProductForm.tsx:243-280` — `hasDeliveryPromo` Switch + conditional `deliveryPromoAmount` InputNumber; `adminService` zeroes the amount when the switch is off, matching the CHECK |
| Server calculation | `COMPLETE` | `orderService.create` sums `amount × qty`, caps at the delivery fee, snapshots onto the order. 8 tests in `delivery-promo.test.ts` including quantity multiplication, multi-line sum, fee cap, zero-fee governorate, historical immutability, and client-forgery rejection |
| Order snapshot | `COMPLETE` | `orders.delivery_discount`; test «keeps past orders unchanged when the product promo changes later» |
| Product-card badge | `PARTIAL` | Works on `/catalog/products` lists; silently absent on home-`discover` and product detail (missing `deliveryPromoAmount` — §2.4) |
| **Cart display** | **`BROKEN INTEGRATION`** | Cart line payload carries no promo fields — §2.5, §7.4 |
| **Checkout display** | **`BROKEN INTEGRATION`** | Same root cause; the preview arithmetic exists but always evaluates to 0 |
| Free-delivery state | `PARTIAL` | `Order.isFreeDelivery` exists and `order_detail_screen.dart:569` renders it for a **placed** order; the pre-order «توصيل مجاني 🎉» state from the design never appears because the preview is 0 |

## 2.11 LOYALTY / GALAXY POINTS — `PARTIAL`

```
account_screen (level card) / galaxy_points_screen.dart → PointsCubit → ApiPointsRepository
  → GET /points → communityController.pointsSummary → pointsService.summary
  → pointsRepo.balance  = SELECT COALESCE(SUM(amount),0) FROM points_ledger WHERE user_id = $1
  → pointsRepo.listActivity = SELECT * … ORDER BY created_at DESC LIMIT 100
```
- **Balance is derived, never stored** — there is no `users.points` column to drift.
- Awards (`POINTS_AWARDS` in `backend/src/types/index.ts`): `orderReceived: 20`,
  `reviewApproved: 1`, `reviewWithPhoto: 5`.
- Award sites: `orderService.applyStatusTransition` (on `COMPLETED`, guarded by
  `order.status !== 'COMPLETED'`) and `reviewsService.moderate` (on approval, guarded by
  `statusUnchanged`).
- **Duplicate prevention is enforced in SQL**, not in code: `uq_points_order_received`
  `UNIQUE(user_id, order_id) WHERE reason='order_received'` and `uq_points_review`
  `UNIQUE(user_id, review_id, reason) WHERE review_id IS NOT NULL`. `pointsRepo.award` uses
  `ON CONFLICT DO NOTHING` so a repeat is a silent no-op rather than a failure of the parent
  operation. Revocation on un-approval: `pointsRepo.revokeForReview` deletes the ledger rows.
- Tests: `community.test.ts` «awards points once for a received order and again when a review is
  approved»; `confirm-receipt.test.ts` «completes the order and awards receipt points exactly once».

**`PARTIAL` — levels are `UI ONLY`.** `lib/features/points/domain/entities/otaku_level.dart` hardcodes
4 levels at thresholds `0 / 30 / 80 / 160` with reward strings («خصم على الطلبات», «هدية مع الطلب»,
«وصول مبكر للتشكيلات»). The thresholds match the design's `LEVELS` array exactly, but there is **no
levels table, no levels endpoint, no admin screen, and no mechanism that grants any of those
rewards**. The file says so itself. ~~Points are also **invisible to the admin** — no admin endpoint or~~ *(**FIXED 2026-08-25 (§21.1)** — `GET /admin/points/summary` and `GET /admin/customers/:id/points`; the original text follows.)* no admin endpoint or
page reads `points_ledger`, and `POINTS_AWARDS` values can only be changed by editing TypeScript.

## 2.12 BIRTHDAY — `PARTIAL`

```
account_screen (birthday row + sheet) / BirthdayDiscountCard → BirthdayStorage
  → GET /birthday  → birthdayService.status → birthdayRepo.status
  → POST /birthday → birthdayService.setBirthday → birthdayRepo.setBirthday
  → users.birth_day / birth_month / birthday_set_at + birthday_discount_usage
```
Rules are all server-side (`birthdayService`, `birthdayRepo`):
- `unlocked` is derived from `COUNT(*) FROM orders WHERE status='COMPLETED'` — the option is hidden
  until the first received order (`BIRTHDAY_LOCKED`).
- Set-once: `UPDATE … WHERE birth_day IS NULL AND birth_month IS NULL`, plus an explicit
  `BIRTHDAY_ALREADY_SET` conflict. `users_birthday_pair` CHECK forces day and month to be set together.
- Day/month sanity: `isValidDayForMonth` (Feb = 29 because no year is stored).
- `rewardAvailable = isBirthdayToday && used_this_year == 0`.
- Once per year is enforced by `birthday_discount_usage UNIQUE(user_id, used_year)`; a losing
  `ON CONFLICT DO NOTHING` insert rolls the whole order back.
- Percentage: `BIRTHDAY_DISCOUNT_PERCENT = 5`, sent to the client as `discountPercent`.

Tested: `community.test.ts` «locks until first completed order, saves once, and cannot be reused in
the same year».

**`PARTIAL` — no admin configuration.** `BIRTHDAY_DISCOUNT_PERCENT` is a TypeScript constant. No
admin page, endpoint, or settings key exposes it, and no admin view shows who has a birthday or who
consumed the discount.

## 2.13 REVIEWS — `COMPLETE`

```
order_detail → RateOrderRoute (rate_order_screen.dart) → per-product state via GET /reviews/find
  → WriteReviewRoute (write_review_screen.dart)
      photo: ApiClient.uploadFile('/uploads', purpose:'review') → POST /api/uploads
      submit: ReviewsCubit.submit → POST /reviews  |  resubmit: PATCH /reviews/:id
  → ReviewSubmittedRoute
Public: product_reviews_section.dart → GET /catalog/products/:productId/reviews
Admin:  ReviewsPage.tsx → GET /admin/reviews?status= → PATCH /admin/reviews/:id/moderate
```
Server-enforced submission rules (`reviewsService.submit`): the order belongs to the caller, the
order is `COMPLETED` (`ORDER_NOT_COMPLETED`), **the rating window has opened**
(`RATING_NOT_YET_AVAILABLE` — added 2026-08-24, see §16), the product is in that order
(`PRODUCT_NOT_IN_ORDER`), one review per (order, product) — enforced both in code
(`REVIEW_EXISTS`) and by `UNIQUE(order_id, product_id)` — and **the attached photo must be a file
this server actually stored** (`INVALID_PHOTO_URL`, via `mediaRepo.findByUrl`; closes finding S-3).
Only a `rejected` review may be edited (`REVIEW_NOT_REJECTED`), and resubmission resets it to
`pending` and clears `reviewed_by/reviewed_at/rejection_reason`.
Moderation is transactional: approve → award points (photo-aware) + `reviewApproved` notification;
reject → `revokeForReview` + `reviewRejected` notification; re-applying the same decision is a no-op
guarded by `statusUnchanged` (so notifications don't duplicate).
Rejection reason is mandatory in three independent places: zod `.refine`, `reviewsService.moderate`,
and the DB CHECK `reviews_rejection_reason_required`.
Product rating aggregation is a DB trigger (`trg_reviews_sync_rating` → `refresh_product_rating`)
over **approved** reviews only.
Tests: 5 in `community.test.ts` + 6 in `community-filter.test.ts`.

## 2.14 COMMUNITY — `PARTIAL`

```
community_screen.dart → ReviewRepository.fetchApprovedPhotoReviews()
  → GET /catalog/community/photos   (no query parameters sent)
  → communityController.listCommunityPhotos → reviewsService.listCommunityPhotos(categoryId=null)
  → reviewRepo.listCommunityPhotos → reviews r LEFT JOIN products p LEFT JOIN categories c
     WHERE r.status='approved' AND r.photo_url IS NOT NULL AND btrim(r.photo_url) <> ''
     [AND p.category_id = $2] ORDER BY r.created_at DESC LIMIT 60
```
Working: masonry feed, `_MyPhotoStatusBanners` (pending / rejected with reason + edit CTA),
`CustomerPhotoViewer` with `InteractiveViewer` zoom and a "view product" CTA
(`community_screen.dart:768`), empty state, error state, guest browsing.

**Category filtering — `COMPLETE` (corrected 2026-08-25).** The audit originally recorded this as
`BACKEND EXISTS / UI MISSING`; that is **no longer true**. `ApiReviewRepository.fetchApprovedPhotoReviews({String? categoryId})`
now forwards the parameter, and `community_screen.dart` holds `_categoryId` with filter chips that
re-query on selection. Server side is unchanged (`communityPhotosQuerySchema`, 6 tests in
`community-filter.test.ts`).

Still true: the `LIMIT 60` is fixed — **no pagination** (no `page`/`cursor` parameter on the
endpoint).

**Upload path:** photos only enter the community via the review flow. There is no direct
"post a photo" action, which matches the design (the design's community empty state CTA points at
reviewing an order).

## 2.15 NOTIFICATIONS — `PARTIAL`

```
notifications_screen.dart → NotificationsCubit → ApiNotificationRepository
  → GET /notifications (returns { items, unread })
  → POST /notifications/:id/read · POST /notifications/read-all
  → notificationsService → notificationRepo → notifications table
```
- Server-side creation sites (traced): `orderService.buildStatusNotification` →
  `orderAccepted` (CONFIRMED), `deliveryUpdate` (OUT_FOR_DELIVERY, body = the admin ETA note),
  `receiptReminder` (COMPLETED), `orderRejected` (REJECTED); and `reviewsService.moderate` →
  `reviewApproved` / `reviewRejected`.
- Deep links are data-driven, not text-derived: `notifications_screen.dart:31-45` routes on
  `orderId` → `OrderDetailRoute`, `productId` → `ProductDetailRoute`. `reviewId` is returned by the
  API but **not routed on**.
- `markRead` is owner-scoped in SQL (`WHERE id=$1 AND user_id=$2`), grouping by "اليوم"/older is
  client-side.
- Tested: `community.test.ts` «creates order notifications and tracks read state per owner».

**Gaps:**
- **Rating reminder (added 2026-08-24):** `src/jobs/ratingReminderJob.ts` emits a `receiptReminder`
  notification once per order when `rating_available_at` falls due. Server-scheduled and
  DB-guarded — see §16. `receiptReminder` is reused deliberately rather than adding an enum value,
  which would have required a CHECK migration plus a matching Flutter enum change for no behavioural
  gain; the two bodies differ («تم استلام طلبك» at delivery vs «شلونها المنتجات؟» a day later).
- **`backInStock` is never produced by any backend logic** (`UNUSED DATA MODEL` on that enum value).
  `promotion` is only produced by the manual admin endpoint below.
- **`POST /admin/notifications` is `ORPHANED API`** — `adminExtrasController.createNotification` +
  `createNotificationSchema` exist and work, but `grep -rn "notification" admin/src` returns **zero
  hits**: there is no admin API wrapper, no page, and no nav entry. The endpoint also only targets a
  single `userId` — there is no broadcast.
- **Push notifications: `MISSING`.** No FCM/APNs dependency in `pubspec.yaml`, no device-token table,
  no push code anywhere. Notifications are in-app pull-only.
- **`NotificationPrefsStorage` is `UI ONLY`.** `lib/features/settings/data/notification_prefs_storage.dart`
  stores 6 toggles (`orders`, `reviews`, `stock`, `offers`, `points`, `bday`) in `SharedPreferences`.
  Nothing sends them to the server, and `notificationRepo.create` never consults any preference — so
  disabling "العروض" changes nothing about what is created or listed.

## 2.16 ADMIN — see §10 for the per-page audit

## 2.17 MEDIA / UPLOADS — `PARTIAL`

| Purpose | Uploader | Endpoint | Reached from | Status |
|---|---|---|---|---|
| `avatar` | customer | `POST /api/uploads` | `account_screen.dart:370` | `COMPLETE` |
| `review` | customer | `POST /api/uploads` | `write_review_screen.dart:149` | `COMPLETE` |
| `product` | admin | `POST /api/admin/uploads` | `ImagesEditor` in `ProductForm` | `COMPLETE` |
| `banner` | admin | `POST /api/admin/uploads` | `BannersPage.tsx:397` | `COMPLETE` |
| **`franchise`** | admin | `POST /api/admin/uploads` | **nothing** | **`UNUSED DATA MODEL`** |
| *category image* | admin | `POST /api/admin/uploads` | `CategoriesPage.tsx:379` — **sent with `purpose="banner"`** | **`PARTIAL` (wrong purpose)** |

Validation chain (all server-side): multer MIME allow-list + 5 MB + 1 file →
`mediaService.upload` re-checks the declared MIME → **`sniffImageMime()` magic-byte check**
(the extension written to disk follows the *sniffed* type, not the client's claim) →
`storage.save` → `INSERT media_files`. `LocalDiskStorage.remove` guards against path traversal.
Serving: `express.static(uploadsRoot, { immutable: true, maxAge: '30d', index: false })` with
`crossOriginResourcePolicy: cross-origin`.
Authorization: anonymous uploads impossible (both routers sit behind `authenticate`); non-admins are
restricted to `review`/`avatar` in `mediaController.upload`.
Tests: 5 in `media.test.ts`, incl. «rejects non-image bytes even when declared as an image».

**Gaps:** there is **no `category` value** in the `media_files.purpose` CHECK, which is why category
images are filed as `banner` — both on disk (`uploads/banner/…`) and in the DB.
`mediaRepo.findByUrl` exists but has **no caller** (dead code). Nothing ever deletes a `media_files`
row or its file: replacing a product image or clearing an avatar orphans the blob permanently.

---

# STEP 4 — BUSINESS RULES

Format: **WHO** · **WHEN allowed** · **WHEN rejected** · **WHERE enforced** · **What stops client tampering**.

### 4.1 Authentication
| Rule | Detail |
|---|---|
| Phone format | `^07\d{9}$` — WHERE: zod (`validators/auth.ts`) **and** the `users.phone` CHECK **and** `verification_codes.phone` CHECK. Triple-enforced. |
| Password | 6–72 chars, bcrypt at `config.bcryptRounds` (default 10). Never returned: `toPublicUser` strips `password_hash`. |
| Unique phone | `users.phone UNIQUE`; `authService.register` pre-checks and returns 409 «هذا الرقم مسجّل بالفعل». |
| OTP | 6 digits, bcrypt-hashed at rest, 10-min TTL, max 5 attempts, single-use (`consumed_at`). Issuing a new code invalidates all previous unconsumed codes for that (phone, purpose). Attempts are incremented **before** comparison, so brute force costs attempts even on failure. |
| Suspended account | `is_active=false` → 403 on login **and** on `GET /auth/me` (so an existing token stops working at the next `me` call). |
| JWT | HS256, `expiresIn: '7d'`, payload `{sub, role, phone}`. Verified on every protected request. |
| Client tampering | Role comes from the signed token only; `requireAdmin` reads `req.auth.role`. A client cannot mint or edit a token without `JWT_SECRET`. |

### 4.2 Authorization / ownership
| Resource | Rule |
|---|---|
| Orders | `orderService.getMyOrder` → 403 if `order.customer.id !== userId`. `cancelOrder` and `confirmReceipt` return **404** instead of 403, deliberately, so order IDs of other users can't be probed. Tested. |
| Reviews | `resubmit` → 403 on non-owner. `submit` → 404 if the order isn't the caller's. |
| Collections | `findOwned` before every mutation; `rename`/`remove` SQL is also `user_id`-scoped. |
| Notifications | `markRead` SQL is `user_id`-scoped; a foreign id is silently a no-op, not an error. |
| Cart | Every `cartRepo` call resolves `cart_id` from `userId` first — an item id from another cart never matches. |
| Uploads | `purpose ∈ {review, avatar}` for non-admins (`mediaController.upload`). |
| Admin surface | `app.use('/api/admin', authenticate, requireAdmin, adminRoutes)` — one choke point, no per-route opt-out. |

### 4.3 Pricing — **the client never sets a price**
`POST /api/orders` accepts **only** `{ governorateId, fullAddress, phone, zoneId? }`
(`createOrderSchema`). Line prices come from a fresh `productRepo.findById` inside the transaction;
`products_total`, `delivery_fee`, `discount`, `delivery_discount`, and `total` are all computed in
`orderRepo.create`. `total = max(0, productsTotal + (deliveryFee − deliveryDiscount) − discount)`.
Test: `delivery-promo.test.ts` «ignores a discount or total forged by the client».

### 4.4 Stock
- Decremented at order creation: `UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2`.
- Restored on rejection **and** on customer cancellation via the shared
  `rejectOrderInTransaction`, guarded by `alreadyRejected` so a retry cannot double-restore.
- Cart additions validate the **merged** quantity against live stock.
- `products.stock >= 0` CHECK is the last line of defence.
- Tests: 4 dedicated cases in `admin-integrity.test.ts`.
- ⚠️ The decrement's `AND stock >= $2` guard silently no-ops on a race rather than aborting the
  transaction — see §8.

### 4.5 Delivery fees & zones
- WHO: admin sets `governorates.delivery_fee` and `governorate_zones.delivery_fee`.
- WHEN: if the chosen governorate has ≥1 active zone, a zone is **required** and its fee wins.
- REJECTED: missing zone → `ZONE_REQUIRED`; unknown zone → `ZONE_INVALID`; zone sent for an
  unzoned governorate → `ZONE_NOT_SUPPORTED`.
- WHERE: `orderService.create`, before any total is computed.
- Snapshot: `orders.zone_id` (FK, `ON DELETE SET NULL`) + `orders.zone_name` (text, immutable).
- Tests: 3 in `community.test.ts` («charges the zone fee, not the governorate fee»).

### 4.6 Delivery promotion
- WHO: admin, per product (`has_delivery_promo` + `delivery_promo_amount`).
- Rule: `deliveryDiscount = min(Σ amount × qty over eligible lines, deliveryFee)`.
- WHERE: `orderService.create`; re-capped in `orderRepo.create`; DB CHECK
  `orders_delivery_discount_within_fee` makes negative delivery structurally impossible.
- Consistency: `products_delivery_promo_amount_positive` CHECK forbids "enabled with amount 0",
  so a badge always corresponds to a real discount.
- Tests: 8.

### 4.7 Birthday discount
See §2.12. The real guard is `birthday_discount_usage UNIQUE(user_id, used_year)` — a losing insert
throws `BIRTHDAY_DISCOUNT_USED` and rolls back the entire order transaction. The Flutter preview in
`order_data_screen._discountFor` is display-only and explicitly commented as such.

### 4.8 Points
See §2.11. WHO: the server only. Duplicate prevention is two unique partial indexes, not code.
`ON CONFLICT DO NOTHING` means a duplicate award never fails the parent operation.

### 4.9 Order status transitions
Single map, single enforcement point (`applyStatusTransition`). Same-status is tolerated
(idempotent retry); anything else outside the map → 409. `REJECTED` requires a note. `COMPLETED` and
`REJECTED` are terminal. `confirmReceipt` additionally requires the caller to own the order, and the
order to be exactly `OUT_FOR_DELIVERY` (`NOT_OUT_FOR_DELIVERY`, `ALREADY_CONFIRMED`).

### 4.10 Review moderation
See §2.13. Rejection reason mandatory in 3 layers. Re-applying the same decision produces no
notification and no points change.

### 4.11 Image ownership & upload validation
- Every upload is attributed (`media_files.uploaded_by`).
- Magic-byte sniffing is the authority on type.
- **Gap:** nothing links a stored `media_files` row to the entity that later references it, and no
  endpoint validates that a submitted URL is one of ours — see §12 S-3 and S-4.

### 4.12 Guest restrictions
Browsing (home, categories, search, product detail, community) is open. Cart, favorites, orders,
reviews, points, collections, notifications, birthday, and uploads are all behind `authenticate`
server-side; the client mirrors this with `AuthGuard` + in-screen `AnimeGuestPrompt`. There is
deliberately **no local guest cart** (documented in `cart_cubit.dart`).

### 4.13 Rate limiting
- Global: `RATE_LIMIT_GLOBAL_MAX` = 300 / 15 min (`app.ts`, applies to everything incl. uploads).
- Auth: `RATE_LIMIT_AUTH_MAX` = 10 / 15 min on the 6 public auth routes only.
- Both `skip: () => isTest`.
- ⚠️ Keyed by IP only — see §12 S-7.

---

# STEP 5 — DESIGN → FUNCTIONAL GAP ANALYSIS

Design read: 28 screen states, 46 section blocks, 370 distinct visible-text nodes, in Arabic and
Sorani Kurdish.

Legend: ✅ present · ⚠️ partial · ❌ absent · n/a not applicable.

| # | Design feature | UI | Flutter | API | Backend | DB | Admin | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | SPLASH | ✅ | ✅ | n/a | n/a | n/a | n/a | ⚠️ | COMPLETE |
| 2 | OFFLINE GATE | ✅ | ✅ `connectivity_plus` | n/a | n/a | n/a | n/a | ✅ | COMPLETE |
| 3 | ONBOARDING (3 slides, once) | ✅ | ✅ `OnboardingStorage` | n/a | n/a | n/a | ❌ | ✅ | COMPLETE |
| 4 | AUTH: login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 5 | AUTH: register | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 6 | AUTH: OTP (6-box, resend timer) | ✅ | ✅ | ✅ | ⚠️ no SMS provider | ✅ | ❌ | ✅ | PARTIAL |
| 7 | AUTH: forgot + RESET PASSWORD | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 8 | Guest browsing («تصفح كزائر») | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ⚠️ | COMPLETE |
| 9 | LOGIN GATE sheet | ✅ | ✅ `login_gate_sheet.dart` | n/a | n/a | n/a | n/a | ⚠️ | COMPLETE |
| 10 | PERSONALIZATION: theme | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | COMPLETE |
| 11 | PERSONALIZATION: language ar/ckb | ✅ | ⚠️ 18 keys only | n/a | n/a | n/a | n/a | ✅ | PARTIAL |
| 12 | HOME hero card | ✅ | ✅ `HomeHeroCard` | ✅ banners | ✅ | ✅ | ✅ | ⚠️ | COMPLETE |
| 13 | HOME promo rail (موسم المدرسة / خصومات) | ✅ | ⚠️ hardcoded copy + derived max % | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY |
| 14 | HOME offers section | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ OffersPage | ✅ | COMPLETE |
| 15 | HOME categories strip | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 16 | HOME featured / selected | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 17 | HOME delivery assurance strip | ✅ | ⚠️ hardcoded text | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY |
| 18 | HOME discover section | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 19 | Product card: `−%` badge | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 20 | Product card: delivery-promo note | ✅ | ⚠️ list only, not detail/discover | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | PARTIAL |
| 21 | Product card: sold-out / stock label | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | COMPLETE |
| 22 | CATEGORIES TAB + counts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 23 | CATEGORY PRODUCTS + subcategory chips | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ create-only | ❌ | PARTIAL |
| 24 | Sort sheet (4 options) | ✅ | ✅ server-side | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 25 | SEARCH: recent + clear all | ✅ | ✅ | n/a | n/a | n/a | n/a | ❌ | COMPLETE |
| 26 | SEARCH: «الأكثر بحثاً» suggestions | ✅ | ⚠️ 6 hardcoded strings | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY |
| 27 | SEARCH: results / empty / searching | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 28 | PRODUCT DETAIL: gallery, options, qty | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 29 | PRODUCT DETAIL: add to collection | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 30 | PRODUCT DETAIL: reviews block + histogram | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 31 | PRODUCT DETAIL: «اشترى هذا المنتج» verified badge | ✅ | ✅ | ✅ (reviews are order-bound) | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 32 | SHARE sheet | ✅ | ✅ `share_plus` (OS sheet) | n/a | n/a | n/a | n/a | ❌ | COMPLETE |
| 33 | CART: items, qty stepper, remove | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 34 | CART: per-item delivery-promo note | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ (server) | BROKEN INTEGRATION |
| 35 | CART: summary + «يُحتسب لاحقاً» | ✅ | ✅ | n/a | n/a | n/a | n/a | ❌ | COMPLETE |
| 36 | FAVORITES tab | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 37 | FAVORITES: discount badges on cards | ✅ | ❌ fields absent from payload | ⚠️ | ⚠️ | ✅ | ✅ | ❌ | PARTIAL |
| 38 | COLLECTIONS tab (create/rename/delete) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | COMPLETE |
| 39 | COLLECTION sheet from product | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 40 | ACCOUNT: profile + level card | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ | PARTIAL |
| 41 | ACCOUNT: birthday saved card | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL |
| 42 | ACCOUNT: «تابعنا» social rows | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ SettingsPage | ❌ | COMPLETE |
| 43 | AVATAR PICKER | ✅ | ⚠️ gallery only (camera removed on purpose) | ✅ | ✅ | ✅ | n/a | ✅ | PARTIAL |
| 44 | AVATAR CROP screen | ✅ | ❌ | n/a | n/a | n/a | n/a | ❌ | MISSING |
| 45 | LOGOUT CONFIRMATION | ✅ | ✅ | n/a | n/a | n/a | n/a | ❌ | COMPLETE |
| 46 | BOTTOM NAV (5 tabs, raised community) | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | COMPLETE |
| 47 | CHECKOUT: «الاسم الكامل» | ✅ | ❌ | ❌ | ❌ | ⚠️ (`users.username` only) | n/a | ❌ | MISSING |
| 48 | CHECKOUT: governorate picker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 49 | CHECKOUT: delivery zone (required) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 50 | CHECKOUT: birthday discount row | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL |
| 51 | CHECKOUT: «خصم التوصيل» row | ✅ | ⚠️ computes, always 0 | ❌ | ✅ | ✅ | ✅ | ✅ (server) | BROKEN INTEGRATION |
| 52 | CHECKOUT: «توصيل مجاني 🎉» | ✅ | ⚠️ post-order only | ❌ | ✅ | ✅ | ✅ | ✅ (server) | PARTIAL |
| 53 | CHECKOUT: COD note | ✅ | ✅ | n/a | n/a | n/a | n/a | ❌ | COMPLETE |
| 54 | ORDER SUCCESS | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE |
| 55 | ORDERS list + status chips + ETA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 56 | ORDER DETAIL: totals, rejection reason | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ no `deliveryDiscount` row | ✅ | PARTIAL |
| 57 | ORDER DETAIL: timeline **with times** | ✅ | ❌ static 4-step, no timestamps | ❌ | ⚠️ table exists, unexposed | ✅ | ❌ | ❌ | PARTIAL |
| 58 | RECEIPT CONFIRMATION prompt | ✅ | ✅ in-card | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 59 | RECEIVED SUCCESS screen (+20 pts) | ✅ | ❌ jumps straight to rate-order | n/a | ✅ points awarded | ✅ | n/a | ✅ (server) | MISSING (screen) |
| 60 | RATE ORDER PRODUCTS list | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 61 | WRITE/EDIT REVIEW + photo + «٥ نقاط» hint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 62 | REVIEW SUBMITTED (pending) | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE |
| 63 | REVIEW APPROVED state | ✅ | ✅ chip + notification | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 64 | REVIEW REJECTED + reason + resubmit | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 65 | COMMUNITY feed (masonry) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ moderation | ✅ | COMPLETE |
| 66 | COMMUNITY: my-photo status banners | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE |
| 67 | COMMUNITY: category filtering | ❌ | ❌ never sends `categoryId` | ✅ | ✅ | ✅ | n/a | ✅ (server) | BACKEND EXISTS / UI MISSING |
| 68 | COMMUNITY PHOTO VIEWER + zoom + view-product | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE |
| 69 | COMMUNITY pagination | ✅ | ❌ | ❌ fixed LIMIT 60 | ❌ | ✅ | n/a | ❌ | MISSING |
| 70 | GALAXY POINTS: balance + ladder + activity | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL |
| 71 | GALAXY POINTS: level rewards actually granted | ✅ | ❌ display strings | ❌ | ❌ | ❌ | ❌ | ❌ | MISSING |
| 72 | NOTIFICATIONS CENTER + grouping + mark-all | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL |
| 73 | SETTINGS: account rows | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE |
| 74 | SETTINGS: notification toggles | ✅ | ⚠️ local only, no effect | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY |
| 75 | BIRTHDAY sheet (day/month) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL |
| 76 | «أضيف إلى السلة» toast + view-cart | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE |
| 77 | DESIGN FOUNDATION page | ✅ (prototype tool) | n/a | n/a | n/a | n/a | n/a | ✅ smoke tests | n/a |
| 78 | PROTOTYPE SCREEN PICKER | ✅ (prototype tool) | n/a — explicitly not shipped | n/a | n/a | n/a | n/a | n/a | n/a |

**Features implemented but absent from the design (item M of Step 6):** franchises/anime taxonomy;
customer order cancellation; admin dashboard in its entirety; delivery-zone CRUD; product options
(`product_options`); banner destination routing; store social settings management.

---

# STEP 6 — EVERYTHING MISSING

### A. Missing backend features
1. **SMS/OTP provider** — `otpService` has no delivery channel; `development` mode ships a fixed
   `123456`. `P0` for production.
2. **Status-history endpoint** — `order_status_history` is written but never read by any API.
3. **Community pagination** — `listCommunityPhotos` has a hard `LIMIT 60`, no cursor/page.
4. **Broadcast notifications** — `POST /admin/notifications` targets exactly one `userId`.
5. **Preference-aware notification delivery** — nothing reads notification preferences.
6. **Points/level configuration** — `POINTS_AWARDS` and level thresholds are TypeScript constants.
7. **Birthday-percentage configuration** — `BIRTHDAY_DISCOUNT_PERCENT = 5` is a constant.
8. **Home promo-tile content** — no table/endpoint for the two design promo cards.
9. **Search suggestions** — no "most searched" aggregation.
10. **`backInStock` notification producer** — the enum value exists with no writer.
11. **Media garbage collection** — nothing ever removes an orphaned `media_files` row or blob.
12. **`category` media purpose** — absent from the CHECK, so category images are stored as `banner`.
13. ~~**Category / subcategory / governorate lifecycle endpoints** — no delete anywhere~~ **FIXED 2026-08-25 (§21.5)**; no
    activate/deactivate for categories or governorates; no update or delete for subcategories.

### B. Missing Flutter integrations
1. **Order cancellation** — `ApiEndpoints.cancelOrder` declared, never used; `OrderRepository` has no
   `cancelOrder`. The endpoint is implemented and tested server-side.
2. **Community category filter** — `fetchApprovedPhotoReviews()` never sends `categoryId`.
3. **Franchises** — no `ApiEndpoints` entry for `/catalog/franchises`; `Product.franchiseIds` is
   parsed and then never read by any widget.
4. **Cart delivery-promo fields** — see §7.4.
5. **`reviewId` notification routing** — returned by the API, not acted on.
6. **Banner `title` / `destinationType`** — `Banner.fromJson` reads only `id`, `imageUrl`,
   `destinationValue`.

### C. Missing admin features
1. **Notifications page** — zero references to notifications in `admin/src` despite a working endpoint.
2. **Galaxy-points visibility** — no page reads `points_ledger`; no manual grant/revoke UI even
   though `reason='manual'` exists in the schema.
3. **Birthday visibility/configuration.**
4. **Order status-history / audit view.**
5. **`deliveryDiscount` row in order detail** — `admin/src/types/orders.ts#AdminOrder` has no such
   field, and `OrderDetailPage.tsx:219-229` prints `productsTotal`, `discount`, `deliveryFee`,
   `total`. With a promo applied the printed lines do not sum to the printed total.
6. **Franchise image upload** — `FranchisesPage.tsx` has only name / sortOrder / isActive; the
   `franchises.image_url` column is unreachable from the UI.
7. **Category activate/deactivate + delete; subcategory edit/delete; governorate
   activate/deactivate + delete.** (The dashboard already surfaces these limits to the operator in
   `Alert` banners at `CategoriesPage.tsx:214` and `GovernoratesPage.tsx:148`.)
8. **Inactive governorates are invisible** — `adminService.listGovernorates()` calls
   `governorateRepo.listActive(db)`, so a deactivated governorate disappears from the admin list
   permanently and `adminGovernorateSchema` has no `isActive` field to restore it.
9. **Product options are lost in the admin list** — `productRepo.list` never selects
   `product_options`, so `adminProductToDraft` sets `options: []`. `productsApi.ts` documents the
   workaround (fetch the public endpoint) and the hard failure for inactive products
   (`INACTIVE_PRODUCT_OPTIONS_UNAVAILABLE`).
10. **No admin user management beyond active/inactive** — cannot create another admin, reset a
    customer password, or view a customer's orders from `CustomersPage`.

### D. Missing database support
1. No `category` value in `media_files.purpose`.
2. No table for home promo tiles / merchandising slots.
3. No table for levels or level rewards.
4. No settings key for points values, birthday percent, or low-stock threshold.
5. No push-device-token table.
6. No column linking a `media_files` row to the entity that references it.
7. No `orders.customer_name` snapshot — the order's displayed name follows `users.username` forever,
   so renaming the account rewrites the name on every historical order.

### E. Broken API connections
1. ~~**Cart line payload ↔ `CartState.deliveryPromoTotal`**~~ — **RESOLVED 2026-08-24.** The cart
   payload now carries `hasDeliveryPromo` / `deliveryPromoAmount` and Flutter maps them, so the
   checkout preview matches the charged total. Covered by a backend regression test.
2. **`deliveryPromoAmount` absent from `/catalog/products/:id` and home `discover`** — the promo
   badge silently vanishes on those surfaces.
3. **Promotion fields absent from `/favorites`** — discount badges vanish in Favorites.
4. **`order_review_screen.dart:246`** computes the products line as `data.total − data.deliveryCost`,
   which is now wrong given `OrderData.total` uses `payableDelivery`.

No Flutter or admin call targets a non-existent backend route — every path in `api_endpoints.dart`
and every URL in `admin/src/api/*` resolves to a declared route. (`ApiEndpoints.cancelOrder` resolves
too; it simply has no caller.)

### F. Dead / orphaned routes
| Endpoint | Implemented | Tested | Called by |
|---|---|---|---|
| `POST /api/orders/:id/cancel` | ✅ | ✅ | **nobody** |
| `GET /api/catalog/franchises` | ✅ | ❌ | **nobody** |
| `POST /api/admin/notifications` | ✅ | ❌ | **nobody** |
| `GET /api/admin/products/:id/franchises` | ✅ | ❌ | wrapper exists in `communityApi.ts:54`, **no page calls it** |
| `GET /api/admin/governorates/:governorateId/zones` | ✅ | ❌ | **nobody** (the UI uses `GET /admin/zones`) |
| ~~`GET /api/catalog/community/photos?categoryId=`~~ | ✅ | ✅ | **no longer orphaned (2026-08-25)** — Flutter now sends it |

### G. Dead API constants / dead code
- `ApiEndpoints.cancelOrder` — `lib/core/constants/api_endpoints.dart:31`, unreferenced.
- `ApiClient.put()` — defined, never called anywhere in `lib/`.
- ~~`mediaRepo.findByUrl` — no caller.~~ **No longer dead (2026-08-25)** — it backs the review-photo ownership check in `reviewsService.assertOwnedPhoto`.
- `pointsService.awardOrderReceived` / `pointsService.balance` / `pointsService.activity` — dead;
  `orderService` calls `pointsRepo.award` directly and the controller uses `summary`.
- `reviewsService.countPending` — dead; `statsRepo.dashboard` computes the count inline.
- `orderRepo.findByNumber` — no caller.
- `favoritesService.isFavorite` / `cartService.clear` — no controller route.
- `admin/src/api/productsApi.ts#fetchAllProducts` — exported, no importer.
- `admin/src/api/communityApi.ts#productFranchises` — exported, no importer.
- `product_discount_percent()` SQL function (migration 016) — never called; the percentage is
  computed in TypeScript in three separate places instead.

### H. UI-only / fake functionality
1. **Notification preference toggles** (`settings_screen` + `NotificationPrefsStorage`) — persist
   locally, affect nothing.
2. **Search "suggested" chips** — 6 hardcoded strings (`search_screen.dart:37`).
3. **Home promo rail** — «موسم المدرسة» is hardcoded copy; the second card is derived from the
   catalog's max real discount (that half is honest, the merchandising half is not configurable).
4. **Delivery assurance strip** — hardcoded «توصيل لكل المحافظات».
5. **Otaku level rewards** — «خصم على الطلبات» / «هدية مع الطلب» / «وصول مبكر للتشكيلات» are
   display strings with no enforcement anywhere.
6. **Order timeline** — a 4-step ladder derived from the current status, presented as a journey.

### I. Backend-only functionality with no UI
`POST /orders/:id/cancel`; `GET /catalog/franchises` + the whole franchise taxonomy on the customer
side; `POST /admin/notifications`; community `categoryId` filter; `order_status_history`;
`points_ledger` reason `'manual'`; notification types `backInStock` and `promotion` (no producer /
no admin trigger respectively).

### J. Admin-only functionality with no customer UI
Franchise management (`/franchises`) produces `product_franchises` rows and `franchiseIds` in every
product payload — the customer app parses them into `Product.franchiseIds` and **never displays or
filters by them**. There is no "browse by anime" screen.

### K. Customer functionality with no admin management
Galaxy points (balance, ledger, award values); Otaku levels and thresholds; birthday discount
percentage and usage; collections; notification preferences; home promo-tile copy; search
suggestions; the low-stock threshold (`LOW_STOCK_THRESHOLD = 5`, hardcoded in `statsRepo.ts` and
mirrored in the dashboard UI); `Product.lowStock` cutoff (`≤ 3`, hardcoded in `product.dart`).

### L. Design features absent from code
Avatar crop screen (#44); checkout full-name field (#47); order-timeline timestamps (#57);
"received success" celebration screen (#59); community pagination (#69); level rewards actually
granted (#71); per-item delivery-promo note in cart (#34); pre-order delivery-discount and
free-delivery rows (#51, #52).

### M. Features in code, absent from design
Franchises/anime taxonomy; customer order cancellation; the entire admin dashboard; delivery-zone
CRUD; product options; banner destination types; store social-link settings; guest-vs-member
distinction on the favorites screen.

### N. Security weaknesses
See §12 — 9 findings.

### O. Business-rule inconsistencies
1. `order_data_screen` subtracts `deliveryDiscount`; `order_review_screen` does not — two adjacent
   screens in the same flow compute the total differently.
2. Admin order detail omits `deliveryDiscount`, so its breakdown doesn't reconcile with its total.
3. `Product.lowStock` (≤3, customer) vs `LOW_STOCK_THRESHOLD` (≤5, admin) — two "low stock"
   definitions.
4. `catalogRepo.mapProduct`, `catalogService.getHome#discover`, and `catalogService.productDetail`
   each hand-roll their own product shape with different field sets.
5. The discount-percent formula is written **four** times: `catalogRepo.mapProduct`,
   `catalogService` ×2, and the unused SQL function `product_discount_percent()`.

### P. Duplicate business logic (client ↔ server)
| Logic | Server | Client | Risk |
|---|---|---|---|
| Order status transition map | `ORDER_STATUS_TRANSITIONS` | `admin/src/constants/orders.ts#STATUS_ACTIONS` | Two maps to keep in sync; server wins, so worst case is a button that 409s |
| Birthday discount amount | `orderService.create` | `order_data_screen._discountFor` | Preview only, commented as such |
| Delivery-discount cap | `orderService` + `orderRepo` + DB CHECK | `CartState.deliveryDiscountFor` | Preview only |
| Rejection-reason requirement | zod + service + DB CHECK | `StatusTransitionButtons.noteMissing` | Benign |
| Stock ceiling on "+" | `cartService` | `CartCubit.increase` | Benign |
| Level thresholds | *(none)* | `OtakuLevel` | Client is the **only** source — see §6-H.5 |

### Q. Persistence problems
1. **`SearchHistoryStorage` is never cleared on logout** — `app.dart:88-95` clears 7 stores but not
   search history, so the next account on the device sees the previous user's searches.
2. `ApiPointsRepository` caches `_balance`/`_activity` in a singleton and `fetchActivity()` returns
   the cached list without fetching — it is correct only when called after `fetchBalance()`.
3. `StoreSettingsRepository` caches social links for the whole session; an admin change requires an
   app restart.
4. `BirthdayStorage.refresh()` swallows every error, so a failed refresh silently serves a stale
   snapshot.
5. Staging and production `apiBaseUrl` are both the placeholder
   `https://api.otaku-galaxy.example/api`.

### R. Loading / empty / error state gaps
Well covered overall (`AnimeEmptyState`, `AnimeErrorState`, `OtakuSkeleton`, `AnimeLoader`,
`OfflineGate`, and `test/network_failure_states_test.dart`). Remaining gaps:
- `CartCubit.load()` and `_sync()` swallow errors entirely (`catch (_) {}`) — a failed cart load is
  indistinguishable from an empty cart.
- `BirthdayStorage.refresh()` and `StoreSettingsRepository.refresh()` likewise swallow.
- `_loadZones` falls back to "no zones" on failure, which silently downgrades a zoned governorate to
  its flat fee in the **preview** (the server still rejects the order with `ZONE_REQUIRED`, so the
  customer hits an error at submit instead of at selection).

### S. Guest-state inconsistencies
Handled cleanly: no local guest cart, per-account state wiped on `AuthUnauthenticated`, guest prompts
rather than hard redirects on browsable screens. Two minor items:
- Search history is device-scoped (see Q1).
- `PersonalizeStorage` / `ThemeCubit` / `LocaleCubit` are device-scoped by design — correct, but it
  means preferences do not follow the account across devices.

---

# STEP 7 — CURRENT vs INTENDED (incomplete features only)

### 7.1 OTP delivery
- **CURRENT:** `otpService.sendVerificationCode` writes a bcrypt-hashed code to `verification_codes`.
  In `development` (the default and the `.env.example` value) the code is the constant `123456`,
  logged to stdout. No other provider exists.
- **EXPECTED:** a real 6-digit code delivered by SMS; the design's OTP screen has a resend timer and
  distinct success/failure states that already assume real delivery.
- **MISSING:** an SMS provider implementation behind the existing `config.verification.provider`
  switch; per-phone (not just per-IP) send throttling; production configuration guard.
- **DEPENDENCIES:** provider account/credentials; `config/index.ts`; deploy-time env validation.

### 7.2 Localization
- **CURRENT:** 18 keys in `AppStrings`; everything else hardcoded Arabic; `ckb` selectable.
- **EXPECTED:** the design ships complete Arabic **and** Sorani Kurdish copy for every screen.
- **MISSING:** extraction of ~350 strings into the translation layer (or an ARB/`intl` pipeline), plus
  Kurdish translations — most of which already exist verbatim inside the design file's `t` dictionary.
- **DEPENDENCIES:** none technical; `AppStrings` already has the right shape.

### 7.3 Community category filtering
- **CURRENT:** server filter complete and tested; `ReviewDto` carries `categoryId`/`categoryName`;
  Flutter sends no parameter and shows no chips.
- **EXPECTED:** filter chips above the masonry feed (one per category, plus "الكل").
- **MISSING:** a `categoryId` parameter on `ReviewRepository.fetchApprovedPhotoReviews`, its
  implementation in `ApiReviewRepository`, chip UI + selection state in `community_screen.dart`, and
  a source for the chip list (`GET /catalog/categories`).
- **DEPENDENCIES:** none — the backend is ready.

### 7.4 Delivery-promo preview in cart & checkout ⚠️ *area under active edit*
- **CURRENT:** DB, admin form, server calculation, order snapshot, and 8 tests are all complete.
  `CartState.deliveryPromoTotal` / `deliveryDiscountFor()` and `OrderData.deliveryDiscount` /
  `payableDelivery` were added to the Flutter side during this audit session. **They evaluate to 0
  in every case**, because `cartRepo.LINE_SELECT` (`backend/src/repositories/cartRepo.ts`, unmodified,
  mtime 2026-08-20) selects only
  `id, product_id, option_value, quantity, created_at, name, stock, price, first image`, and
  `CartRepositoryImpl._mapLine` constructs its `Product` from exactly those fields.
- **EXPECTED (design #34, #51, #52):** each eligible cart line shows
  «🚚 خصم ١٬٠٠٠ د.ع من التوصيل لكل قطعة»; checkout shows a «خصم التوصيل − X» row and «توصيل مجاني 🎉»
  when the discount covers the fee.
- **MISSING:** (a) `p.has_delivery_promo` and `p.delivery_promo_amount` in `LINE_SELECT` and in
  `CartLine`/`mapLine`; (b) those two fields in `CartRepositoryImpl._mapLine`'s `Product`;
  (c) the per-item note in `cart_screen.dart`; (d) reconciling `order_review_screen.dart:246` with
  the new `OrderData.total`.
- **DEPENDENCIES:** backend change is a pure additive SELECT — no migration, no contract break.
  A backend test asserting the cart payload carries both fields would prevent regression.

### 7.5 `deliveryPromoAmount` on detail & discover
- **CURRENT:** present in `catalogRepo.mapProduct` only; absent from the two hand-rolled mappers in
  `catalogService`.
- **EXPECTED:** identical product shape from every catalog surface.
- **MISSING:** add the field to both mappers (ideally collapse all three onto `mapProduct`); add
  `deliveryPromoAmount` to `catalog.test.ts`'s `PROMO_KEYS`.
- **DEPENDENCIES:** none.

### 7.6 Promotion fields in `/favorites`
- **CURRENT:** `favoritesRepo.shapeProductImages` omits `previousPrice`, `discountPercent`,
  `hasDeliveryPromo`, `deliveryPromoAmount`, `franchiseIds`.
- **EXPECTED:** favorites cards look identical to home/category cards.
- **MISSING:** reuse `catalogRepo.mapProduct` in `favoriteRepo.list`.
- **DEPENDENCIES:** none.

### 7.7 Order cancellation
- **CURRENT:** endpoint implemented, transactional, stock-restoring, double-cancel-proof, tested.
  `ApiEndpoints.cancelOrder` is declared and unused.
- **EXPECTED:** a customer-visible cancel action while the order is `PENDING_ADMIN_CONFIRMATION` or
  `CONFIRMED`.
- **MISSING:** `OrderRepository.cancelOrder` + implementation; a confirm sheet and button in
  `order_detail_screen.dart` gated on those two statuses.
- **DEPENDENCIES:** none.
- **NOTE:** the design has no cancel affordance — this is a **code-ahead-of-design** decision that
  needs a product call before UI is built.

### 7.8 Order status-history timeline
- **CURRENT:** every transition writes `order_status_history(order_id, status, note, changed_by,
  created_at)`. The API surfaces only two derived scalars (`rejectionReason`, `deliveryNote`). The
  app renders a static ladder.
- **EXPECTED (design #57):** each completed step shows its time.
- **MISSING:** a `statusHistory: [{status, note, createdAt}]` array on the order DTO (customer view
  must **not** leak `changed_by`); parsing into `Order`; timestamped steps in the timeline widget;
  an admin audit view.
- **DEPENDENCIES:** none — no migration required.

### 7.9 Notification preferences
- **CURRENT:** 6 local toggles with no effect.
- **EXPECTED:** toggles that actually suppress the corresponding notifications.
- **MISSING:** a `notification_preferences` table (or a JSONB column on `users`), GET/PATCH
  endpoints, a preference check in `notificationRepo.create` (or in each producer), and repointing
  `NotificationPrefsStorage` at the API.
- **DEPENDENCIES:** migration + endpoints + Flutter repository. Decide whether "points" and
  "birthday" toggles are meaningful at all — no such notifications are produced today
  (migration 012 states this exclusion deliberately).

### 7.10 Loyalty levels
- **CURRENT:** thresholds and reward copy hardcoded in `otaku_level.dart`; award amounts hardcoded in
  `POINTS_AWARDS`; nothing grants any reward.
- **EXPECTED:** levels and rewards that mean something and that the business can tune.
- **MISSING:** a `levels` table (or settings keys), a `GET /points` response carrying the ladder, an
  admin screen, and an actual redemption mechanism.
- **DEPENDENCIES:** a product decision on what each reward *is* before any of it is built.

### 7.11 Admin gaps (categories / governorates / subcategories / franchise image / notifications)
- **CURRENT:** create + partial update only; no delete anywhere; no activate/deactivate for
  categories or governorates; inactive governorates are invisible to the admin; no franchise image
  field; no notifications page.
- **EXPECTED:** full lifecycle management of every catalog dimension.
- **MISSING:** `isActive` in `adminCategorySchema` and `adminGovernorateSchema`; switch
  `adminService.listGovernorates` to a `listAll`; `PATCH`/`DELETE /admin/subcategories/:id`;
  soft-delete semantics for categories (products FK is `ON DELETE RESTRICT`, so hard delete is
  unsafe); an `ImageUploadField purpose="franchise"` in `FranchisesPage`; a notifications page +
  API wrapper.
- **DEPENDENCIES:** decide soft vs hard delete per entity first.

### 7.12 Media purpose for category images
- **CURRENT:** uploaded as `purpose="banner"` (`CategoriesPage.tsx:379`).
- **EXPECTED:** `purpose="category"`.
- **MISSING:** add `'category'` to the `media_files.purpose` CHECK (migration), to `MEDIA_PURPOSES`,
  to `UploadPurpose` in `uploadsApi.ts`, and change the one call site.
- **DEPENDENCIES:** a migration; existing rows keep the old label unless backfilled.

---

# STEP 8 — DATABASE AUDIT

*(read-only; nothing was changed)*

### 8.1 What is genuinely strong
- Every money column is `NUMERIC(12,2)` with a `>= 0` CHECK — no floats anywhere.
- Business invariants live in the schema, not just in code: `products_previous_price_higher`,
  `products_delivery_promo_amount_positive`, `orders_delivery_discount_within_fee`,
  `users_birthday_pair`, `reviews_rejection_reason_required`.
- Duplicate prevention is by unique index, not by application check:
  `uq_points_order_received`, `uq_points_review`, `birthday_discount_usage(user_id, used_year)`,
  `reviews(order_id, product_id)`, `favorites(user_id, product_id)`,
  `cart_items(cart_id, product_id, option_value)`.
- Historical integrity: `order_items` intentionally has **no** FK to `products`, and carries
  `product_name`, `price`, `image_url` snapshots; `orders` carries `zone_name` and
  `delivery_discount`; `reviews` carries `product_name` and `customer_name`.
- Derived state is computed, not duplicated: points balance is `SUM(points_ledger.amount)`;
  `products.rating`/`review_count` are maintained by a trigger from approved reviews only.
- Partial indexes match the actual query shapes (`WHERE is_active = TRUE`, `WHERE status='pending'`,
  `WHERE read_at IS NULL`, `WHERE status='approved' AND photo_url IS NOT NULL`).

### 8.2 Missing indexes
| Table | Query | Index |
|---|---|---|
| `reviews` | `listForAdmin` with no status filter → `ORDER BY created_at DESC LIMIT/OFFSET` | no plain `(created_at DESC)` index; the three existing ones are all partial |
| `orders` | `listAll` with no status filter (`OrdersPage` default) → `ORDER BY created_at DESC` | `idx_orders_status` is partial on `PENDING_ADMIN_CONFIRMATION` only; no plain `(created_at DESC)` |
| `orders` | `statusCounts` → `GROUP BY status` over the whole table | no `(status)` index |
| `birthday_discount_usage` | `order_id` FK | no index (fine at current scale; matters for cascade deletes) |
| `notifications`, `points_ledger` | `order_id` / `review_id` / `product_id` FKs | unindexed FKs — deleting a product/order/review scans |
| `media_files` | — | `uploaded_by` and `purpose` are indexed; `url` is not, and `findByUrl` (dead today) would seq-scan |

### 8.3 Missing / weak constraints
1. **`banners.destination_value` is unconstrained text** with no CHECK tying it to
   `destination_type`. `destination_type='product'` with a non-UUID value is storable, and nothing
   validates that the target exists. `adminBannerSchema` allows any `string.max(80)`.
2. **`store_settings` has no key allow-list in the DB** — only `SETTING_KEYS` in
   `settingsRepo.ts` filters writes. A direct SQL insert can add arbitrary keys.
3. **`products.rating` / `review_count` are directly writable** by
   `PATCH /admin/products/:id` (`adminProductUpdateSchema` accepts `rating` and `reviewCount`), which
   the review trigger will silently overwrite on the next moderation. The admin form disables both
   inputs (`ProductForm.tsx:325, 333`) but the API does not.
4. **No CHECK that `orders.total` equals its components** — the invariant lives only in
   `orderRepo.create`.
5. **`order_items.product_id` is nullable with no FK** (intentional for history) but there is no
   partial index on it; `reviews.product_id` is the same.
6. **`verification_codes` is never pruned** — consumed and expired rows accumulate forever.

### 8.4 Nullable columns that arguably should not be
- `products.rating` — `NULL` legitimately means "no approved reviews yet". Correct as-is.
- `banners.title` — nullable and, separately, never read by Flutter (§8.6).
- `franchises.image_url` — nullable and unreachable from the admin UI (§8.6).
- `orders.zone_id` — nullable by design (unzoned governorates), `ON DELETE SET NULL` with
  `zone_name` preserving the history. Correct.

### 8.5 Orphan-record risks
1. **`media_files` rows and their blobs are never deleted.** Replacing a product's images
   (`DELETE FROM product_images` then re-insert) or clearing an avatar leaves the file on disk and the
   row in the table with nothing referencing it.
2. **`banners.image_url` / `categories.image_url` / `franchises.image_url` / `users.avatar_url` /
   `reviews.photo_url` are plain text**, not FKs to `media_files`. There is no referential link in
   either direction.
3. `products.category_id` is `ON DELETE RESTRICT`, which is why no category delete exists — correct
   and deliberate.

### 8.6 Fields never used by any UI
| Column | Written by | Read by |
|---|---|---|
| `order_status_history.*` | every transition | only two derived scalars (`rejectionReason`, `deliveryNote`); no timeline anywhere |
| `banners.title` | admin | **nothing** — `Banner.fromJson` ignores it |
| `banners.destination_type` | admin | **nothing** — Flutter reads only `destinationValue` |
| `franchises.image_url` | **nothing** (no admin field) | `franchiseRepo` returns it; no UI shows it |
| `product_franchises` → `franchiseIds` | admin | parsed into `Product.franchiseIds`, **never rendered** |
| `governorates.is_active` | migration default only | admin can neither set nor see inactive rows |
| `categories.is_active` | migration default only | admin can see it, cannot change it |
| `subcategories.is_active`, `subcategories.sort_order` | create only | no update path |
| `media_files.purpose='franchise'` | never | — |
| `notifications.type='backInStock'` | never | — |
| `notifications.review_id` | reviews moderation | returned in the DTO, **not routed on** by the app |
| `points_ledger.reason='manual'` | never (no admin UI) | — |
| `users.birthday_set_at` | `setBirthday` | never read |
| `product_discount_percent()` fn | — | never called |

### 8.7 Fields the UI/logic needs but that do not exist
- `orders.customer_name` snapshot (renaming an account rewrites history).
- A `category` value in `media_files.purpose`.
- Notification-preference storage.
- Level/threshold/reward storage.
- Configurable points values, birthday percentage, and low-stock threshold.
- Push-device tokens.

### 8.8 Migration consistency
19 migrations, strictly additive, correctly ordered, each with an explanatory Arabic header. No
`DROP`, no destructive `ALTER`. Migration 015 backfills Najaf zones at the existing governorate fee
(no silent price change) and 019 backfills `delivery_promo_amount = 1000` for products that already
had the flag (preserving observed behaviour) **before** adding the consistency CHECK — the correct
order. `migrate.ts` supports `--reset`. **No down-migrations exist** — rollback is manual.

---

# STEP 9 — API CONTRACT AUDIT

Response envelope is uniform everywhere: `{ success, data, message }` on success,
`{ success:false, data:null, message, error:{ code, details? } }` on failure. `204` returns no body
(`noContent`, used by 2 admin deletes).

## 9.1 Public — `/api/auth` (per-purpose rate limits since 2026-08-25 — see §19.1)

| Method | Path | Auth | Role | Request | Response | DB effect | Flutter | Admin | Status |
|---|---|---|---|---|---|---|---|---|---|
| POST | `/auth/register` | — | — | `{username, phone, password}` | `{user}` | INSERT `users`, INSERT `verification_codes` | ✅ | ❌ | COMPLETE |
| POST | `/auth/verify` | — | — | `{phone, code}` | `{token, user}` | UPDATE `verification_codes` | ✅ | ❌ | COMPLETE |
| POST | `/auth/resend-code` | — | — | `{phone}` | `null` | invalidate + INSERT `verification_codes` | ✅ | ❌ | COMPLETE |
| POST | `/auth/login` | — | — | `{phone, password}` | `{token, user}` | — | ✅ | ✅ | COMPLETE |
| POST | `/auth/forgot-password` | — | — | `{phone}` | `null` | INSERT `verification_codes` | ✅ | ❌ | COMPLETE |
| POST | `/auth/reset-password` | — | — | `{phone, code, newPassword}` | `null` | UPDATE `users.password_hash` | ✅ | ❌ | COMPLETE |
| GET | `/auth/me` | JWT | any | — | `{user}` | — | ✅ | ✅ | COMPLETE |
| PATCH | `/auth/me` | JWT | any | `{username?, avatarUrl?}` | `{user}` | UPDATE `users` | ✅ | ❌ | COMPLETE |
| PATCH | `/auth/me/password` | JWT | any | `{currentPassword, newPassword}` | `null` | UPDATE `users.password_hash` | ✅ | ❌ | COMPLETE |

## 9.2 Public — `/api/catalog` (no auth)

| Method | Path | Request | Response | Flutter | Admin | Status |
|---|---|---|---|---|---|---|
| GET | `/catalog/home` | — | `{banners, offers, selectedProducts, categories, discover}` | ✅ | ❌ | PARTIAL — `discover` items lack `deliveryPromoAmount` |
| GET | `/catalog/categories` | — | `{items:[{id,name,imageUrl,sortOrder,isActive,subcategories[]}]}` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/governorates` | — | `{items:[{id,name,deliveryFee,isActive}]}` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/products` | `page,limit,categoryId,subcategoryId,offer,selected,sort` | `Paginated<Product>` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/products/search` | `q,page,limit` | `Paginated<Product>` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/products/:id` | — | full product + `options` | ✅ | ✅ (edit workaround) | PARTIAL — lacks `deliveryPromoAmount`; **404 for inactive products**, which is what forces the admin workaround |
| GET | `/catalog/governorates/:governorateId/zones` | — | `{items:[Zone]}` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/franchises` | — | `{items:[Franchise]}` | ❌ | ❌ | **ORPHANED API** |
| GET | `/catalog/products/:productId/reviews` | — | `[ReviewDto]` | ✅ | ❌ | COMPLETE |
| GET | `/catalog/community/photos` | `categoryId?` | `[ReviewDto]` (max 60) | ⚠️ param never sent | ❌ | PARTIAL — no pagination |
| GET | `/catalog/settings` | — | `{social:{tiktok,instagram,whatsapp}}` | ✅ | ❌ | COMPLETE |

## 9.3 Customer — `/api` (JWT required on all)

| Method | Path | Request | DB effect | Flutter | Status |
|---|---|---|---|---|---|
| GET | `/favorites` | `page,limit` | — | ✅ | PARTIAL — payload lacks promotion fields |
| POST | `/favorites` | `{productId}` | INSERT `favorites` | ✅ | COMPLETE |
| DELETE | `/favorites/:productId` | — | DELETE `favorites` | ✅ | COMPLETE |
| GET | `/cart` | — | upsert `carts` | ✅ | PARTIAL — lines lack promo fields |
| POST | `/cart` | `{productId, quantity, optionValue?}` | upsert `cart_items` | ✅ | COMPLETE |
| PATCH | `/cart/:id` | `{quantity}` | UPDATE `cart_items` | ✅ | COMPLETE |
| DELETE | `/cart/:id` | — | DELETE `cart_items` | ✅ | COMPLETE |
| POST | `/orders` | `{governorateId, fullAddress, phone, zoneId?}` | INSERT orders/items/history, UPDATE stock, maybe INSERT birthday usage, clear cart | ✅ | COMPLETE |
| GET | `/orders` | `page,limit,status?` | — | ✅ | COMPLETE |
| GET | `/orders/:id` | — | — | ✅ | PARTIAL — no `statusHistory` |
| POST | `/orders/:id/cancel` | — | UPDATE status, restore stock, INSERT history | ❌ | **ORPHANED API** |
| POST | `/orders/:id/confirm-receipt` | — | → COMPLETED, award points, notify | ✅ | COMPLETE |
| GET | `/reviews` | — | — | ✅ | COMPLETE |
| GET | `/reviews/find` | `orderId,productId` | — | ✅ | COMPLETE |
| POST | `/reviews` | `{orderId, productId, rating, comment, photoUrl?}` | INSERT `reviews` (trigger recomputes rating) | ✅ | PARTIAL — `photoUrl` unvalidated (§12 S-3) |
| PATCH | `/reviews/:id` | `{rating, comment, photoUrl?}` | UPDATE `reviews` → pending | ✅ | PARTIAL — same |
| GET | `/points` | — | — | ✅ | COMPLETE |
| GET/POST | `/collections` | `{name}` | INSERT `collections` | ✅ | COMPLETE |
| PATCH/DELETE | `/collections/:id` | `{name}` | UPDATE/DELETE | ✅ | COMPLETE |
| POST/DELETE | `/collections/:id/products[/:productId]` | `{productId}` | INSERT/DELETE `collection_products` | ✅ | COMPLETE |
| GET | `/notifications` | — | — | ✅ | COMPLETE |
| POST | `/notifications/read-all` | — | UPDATE `read_at` | ✅ | COMPLETE |
| POST | `/notifications/:id/read` | — | UPDATE `read_at` (owner-scoped) | ✅ | COMPLETE |
| GET | `/birthday` | — | — | ✅ | COMPLETE |
| POST | `/birthday` | `{day, month}` | UPDATE `users` (once) | ✅ | COMPLETE |
| POST | `/uploads` | multipart `file` + `purpose` | INSERT `media_files` + disk write | ✅ | COMPLETE |

## 9.4 Admin — `/api/admin` (JWT + `role='admin'` on all)

| Method | Path | Admin caller | Status |
|---|---|---|---|
| GET/POST `/admin/products`, PATCH/DELETE `/admin/products/:id` | `productsApi.ts` | ✅ | PARTIAL — list omits `product_options` |
| GET/POST `/admin/categories`, PATCH/DELETE `/admin/categories/:id`, PATCH/DELETE `/admin/subcategories/:id` | `categoriesApi.ts` | ✅ | COMPLETE — delete guarded by dependency check (§21.5) |
| POST `/admin/subcategories` | `categoriesApi.ts` | ✅ | PARTIAL — create only |
| GET/POST `/admin/banners`, PATCH/DELETE `/admin/banners/:id` | `bannersApi.ts` | ✅ | COMPLETE |
| GET/POST `/admin/governorates`, PATCH `/admin/governorates/:id` | `governoratesApi.ts` | ✅ | PARTIAL — `listActive` only, no isActive field |
| GET `/admin/orders`, GET `/admin/orders/:id`, PATCH `/admin/orders/:id/status` | `ordersApi.ts` | ✅ | PARTIAL — client DTO lacks `deliveryDiscount` |
| GET `/admin/users`, PATCH `/admin/users/:id/active` | `customersApi.ts` | ✅ | COMPLETE |
| GET `/admin/stats` | `communityApi.ts` | ✅ | COMPLETE |
| GET `/admin/reviews`, PATCH `/admin/reviews/:id/moderate` | `communityApi.ts` | ✅ | COMPLETE |
| GET/POST `/admin/franchises`, PATCH/DELETE `/admin/franchises/:id` | `communityApi.ts` | ✅ | PARTIAL — no image field |
| GET `/admin/products/:id/franchises` | wrapper only | ❌ | **ORPHANED API** |
| GET `/admin/zones`, POST `/admin/zones`, PATCH/DELETE `/admin/zones/:id` | `communityApi.ts` | ✅ | COMPLETE |
| GET `/admin/governorates/:governorateId/zones` | — | ❌ | **ORPHANED API** |
| GET/PATCH `/admin/settings` | `communityApi.ts` | ✅ | COMPLETE |
| POST `/admin/notifications` | — | ❌ | **ORPHANED API** |
| POST `/admin/uploads` | `uploadsApi.ts` | ✅ | COMPLETE |

## 9.5 Contract findings
1. **No Flutter or admin call targets a missing endpoint.** Every path resolves.
2. **6 orphaned endpoints / parameters** (§6-F).
3. **Endpoints returning incomplete data:** `/catalog/products/:id` and home `discover`
   (`deliveryPromoAmount`); `/favorites` (all promotion fields); `/orders/:id` and
   `/admin/orders/:id` (`statusHistory`); `/admin/products` (`product_options`);
   `/admin/orders/:id` — `deliveryDiscount` exists on the wire but is absent from
   `admin/src/types/orders.ts` and unused.
4. **Missing request validation:** `submitReviewSchema.photoUrl` / `resubmitReviewSchema.photoUrl` —
   `z.string().trim().max(500)` with **no URL format check and no ownership check**, while the
   admin's `imageUrl` validator requires `https?://…` or `/uploads/…`. `updateProfileSchema.avatarUrl`
   requires `.url()` but accepts **any** origin.
5. **Missing authorization:** none found. Every mutating route is behind `authenticate`, and
   `/api/admin/*` behind `requireAdmin`, at the router level.
6. **Inconsistent response structures:** list endpoints are inconsistent —
   `{items:[…]}` (categories, governorates, zones, franchises, notifications, cart),
   bare arrays (`/reviews`, `/collections`, `/catalog/community/photos`,
   `/catalog/products/:id/reviews`), and `Paginated<T>` (`/catalog/products`, `/orders`,
   `/favorites`, `/admin/products`, `/admin/reviews`). Clients handle each shape ad hoc.
7. **Three different product shapes** are emitted by the catalog domain (§6-O.4).

---

# STEP 10 — ADMIN DASHBOARD AUDIT

Auth: `LoginPage` → `POST /auth/login` → `useAuthStore` (Zustand) → `ProtectedRoute`.
Axios interceptor injects the bearer token and, on 401, clears the store and hard-redirects to
`/login`.

### `/` — DashboardHome
- **View:** pending-orders count, out-for-delivery count, pending-reviews count, out-of-stock count
  (with low-stock tooltip), completed revenue, this-month revenue, in-progress order value, total /
  completed / rejected orders, customers, active products, 5 most recent orders, low-stock table.
- **Create/Edit/Delete/Upload:** none.
- **API:** `GET /admin/stats`, `GET /admin/orders?limit=5`.
- **Tables:** `orders`, `products`, `users`, `reviews` (one aggregated SQL statement in
  `statsRepo.dashboard`).
- **Rules:** revenue counts `COMPLETED` only; in-progress excludes `COMPLETED` and `REJECTED`;
  `LOW_STOCK_THRESHOLD = 5` (hardcoded server-side and mirrored in the UI copy).

### `/orders` + `/orders/:id`
- **View:** paginated list, status filter, status counts, full detail (customer, phone, province,
  zone, address, items, totals).
- **Edit:** status transitions only, via `StatusTransitionButtons`.
- **Delete/Upload:** none (correct — orders are financial records).
- **API:** `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status`.
- **Rules enforced client-side (mirroring the server):** allowed transitions from
  `STATUS_ACTIONS`; rejection note mandatory (`noteMissing`); 4 ETA presets for `OUT_FOR_DELIVERY`.
- **Gap:** no `deliveryDiscount` line; no status-history view.

### `/products`, `/products/new`, `/products/:id/edit`
- **View:** paginated admin list (includes inactive).
- **Create/Edit:** name, description, price, stock, category, subcategory, franchises (multi-select),
  images (multi-upload + reorder), options (`OptionsEditor`), `previousPrice` (with computed
  discount preview), `hasDeliveryPromo` + `deliveryPromoAmount`, `isOffer`, `isSelected`, `isActive`.
  `rating` and `reviewCount` are shown **disabled** (trigger-owned).
- **Delete:** soft only (`DELETE /admin/products/:id` → `is_active=false`).
- **Upload:** `ImagesEditor purpose="product"`.
- **Rules:** `previousPrice > price` surfaced as `INVALID_PREVIOUS_PRICE`; PATCH is
  presence-aware — an absent key means "unchanged", an explicit `[]` clears (9 dedicated tests).
- **Gap:** the admin list omits `product_options`, forcing `getProductForEdit` to fetch the public
  endpoint; that endpoint 404s for inactive products, so `patchProductFlags` fails on them with an
  explicit `INACTIVE_PRODUCT_OPTIONS_UNAVAILABLE` error.

### `/categories`
- **View:** name, image, sortOrder, `isActive` (read-only tag), subcategory list.
- **Create:** category + subcategory. **Edit:** category name/image/sortOrder only.
- **Delete:** none. **Upload:** `ImageUploadField purpose="banner"` ← wrong purpose.
- The page itself warns the operator at `CategoriesPage.tsx:214` that activation/deletion and
  subcategory editing are unavailable.

### `/banners`
Full CRUD + image upload + `destinationType`/`destinationValue`/`sortOrder`/`isActive`.
**Note:** `title` and `destinationType` are stored but ignored by the Flutter app.

### `/governorates`
- **View:** active governorates only. **Create/Edit:** name + `deliveryFee`.
- **Delete / activate / deactivate:** none — the page states this at `GovernoratesPage.tsx:148`.

### `/customers`
- **View:** paginated customers (`role='customer'` only). **Edit:** active toggle only.
- No order history, no points, no password reset, no admin creation.

### `/offers`
Toggles `isOffer` / `isSelected` via `patchProductFlags`, which first re-reads the public product to
avoid the images/options wipe. Fails loudly on inactive products.

### `/reviews`
- **View:** paginated, status-filtered, with the photo rendered via antd `Image` (zoomable).
- **Edit:** approve / reject with a mandatory reason.
- **API:** `GET /admin/reviews`, `PATCH /admin/reviews/:id/moderate`.
- **Effects:** points award/revoke + customer notification, transactional.

### `/franchises`
Create / edit (name, sortOrder, isActive) / delete. Delete is refused when
`productCount > 0` (`FRANCHISE_HAS_PRODUCTS`). **No image field**, so `franchises.image_url` is dead.

### `/zones`
Full CRUD, `isActive` toggle, `deliveryFee` per zone. Duplicate name per governorate →
`ZONE_NAME_TAKEN`; unknown governorate → `GOVERNORATE_NOT_FOUND`.

### `/settings`
Three social links (TikTok, Instagram, WhatsApp), validated as URL-or-empty (WhatsApp also accepts
`+?\d{8,15}`). Server-side key allow-list in `settingsRepo.SETTING_KEYS`.

### Customer features with **no** admin control
Galaxy points & ledger · Otaku levels & rewards · birthday percentage & usage · collections ·
notification preferences · manual notifications (endpoint exists, no page) · home promo-tile copy ·
search suggestions · order status history · community category curation.

### Configuration that should not be hardcoded
| Value | Where hardcoded |
|---|---|
| `POINTS_AWARDS` = 20 / 1 / 5 | `backend/src/types/index.ts` — **now the fallback default; admin-editable via `store_settings` (§21.6)** |
| `BIRTHDAY_DISCOUNT_PERCENT` = 5 | `backend/src/types/index.ts` — **now the fallback default; admin-editable (§21.6)** |
| Level thresholds 0/30/80/160 + reward copy | `lib/features/points/domain/entities/otaku_level.dart` |
| `LOW_STOCK_THRESHOLD` = 5 | `backend/src/repositories/statsRepo.ts` |
| `Product.lowStock` cutoff = 3 | `lib/features/products/domain/entities/product.dart` |
| `MAX_COLLECTIONS_PER_USER` = 50 | `backend/src/services/collectionsService.ts` |
| `COMMUNITY_LIMIT` = 60 | `backend/src/services/reviewsService.ts` |
| OTP TTL 10 min / 5 attempts | `backend/src/services/otpService.ts` (duplicated in `config`, **the service constants win**) |
| ETA presets (4 strings) | `admin/src/components/StatusTransitionButtons.tsx:34` |
| Home promo copy «موسم المدرسة» | `lib/features/home/presentation/widgets/home_compositions.dart:189` |
| Search suggestion chips | `lib/features/search/presentation/screens/search_screen.dart:37` |

> Note: `otpService.ts` defines its own `CODE_TTL_MS` and `MAX_ATTEMPTS` and **never reads**
> `config.verification.lifetimeMinutes` / `maxAttempts`. Those two env vars in `.env.example` have no
> effect.

---

# STEP 11 — TEST COVERAGE MATRIX

| Feature | Unit | Widget | Integration | Backend | E2E | Security | Verdict |
|---|---|---|---|---|---|---|---|
| Register + OTP + login + me | — | — | ✅ Flutter | ✅ 10 | — | ✅ (invalid phone, dup phone, wrong code, unauth routes) | COVERED |
| Session restore / 401 handling | ✅ | ✅ | ✅ | ✅ | — | ✅ | COVERED |
| Password reset / change | — | — | — | ✅ 3 | — | ✅ (unauth change refused) | COVERED |
| Guest restrictions | — | ⚠️ | — | ✅ («blocks unauthenticated customer routes») | — | ✅ | PARTIAL |
| Theme / language / persistence | ✅ | ✅ | — | n/a | — | — | COVERED |
| Catalog list / search / detail / 404 | — | — | ✅ | ✅ 5 | — | — | COVERED |
| Sorting (closed enum, SQL-injection-proof) | — | — | — | ✅ 4 | — | ✅ | COVERED |
| Promotion fields (previousPrice/%) | — | — | — | ✅ 3 | — | ✅ (invalid previousPrice refused) | PARTIAL — `deliveryPromoAmount` not asserted |
| Favorites | — | — | ✅ | ✅ 1 | — | — | COVERED |
| Cart add/update/remove/stock | — | ✅ | ✅ 3 | ✅ 1 | — | — | COVERED |
| **Cart promo-field payload** | — | — | — | ❌ | — | — | **MISSING** |
| Order creation + totals + cart clear | — | — | ✅ | ✅ | — | ✅ (forged total ignored) | COVERED |
| Status transitions | — | — | — | ✅ 2 | — | ✅ | COVERED |
| Stock restore on reject/cancel | — | — | — | ✅ 4 | — | ✅ (double-restore, double-cancel) | COVERED |
| Confirm receipt | — | — | — | ✅ 7 | — | ✅ (cross-user, double-confirm, wrong state, unauth) | COVERED |
| Delivery zones pricing | — | — | — | ✅ 3 | — | ✅ (admin-only zone management) | COVERED |
| Delivery promo (server) | — | — | — | ✅ 8 | — | ✅ (client forgery) | COVERED |
| **Delivery promo (client preview)** | — | ❌ | ❌ | — | — | — | **MISSING** |
| Birthday | — | — | — | ✅ 1 (multi-assert) | — | ✅ (reuse in same year) | COVERED |
| Points ledger + duplicate prevention | — | — | — | ✅ 2 | — | ✅ | COVERED |
| **Otaku levels** | ❌ | ❌ | — | n/a | — | — | **MISSING** |
| Reviews submit/moderate/resubmit | — | — | — | ✅ 5 | — | ✅ (cross-user review, customer moderating) | COVERED |
| Community photos + category filter | — | — | — | ✅ 6 | — | ✅ (invalid uuid rejected) | COVERED (server) / MISSING (client) |
| Collections + ownership | — | — | — | ✅ 1 (multi-assert) | — | ✅ | COVERED |
| Notifications + read state | — | — | — | ✅ 1 | — | ✅ (per-owner) | COVERED |
| **Notification preferences** | — | ❌ | — | ❌ | — | — | **MISSING** |
| Media upload + magic bytes + purpose | — | — | — | ✅ 5 | — | ✅ (anon, wrong purpose, fake image) | COVERED |
| **Review `photoUrl` validation** | — | — | — | ❌ | — | ❌ | **MISSING** |
| Admin PATCH integrity | — | — | — | ✅ 5 | — | — | COVERED |
| Admin auth boundary | — | — | — | ✅ (zones, reviews) | — | ✅ | PARTIAL — not every admin route probed |
| Design system rendering (light/dark × 3 widths) | — | ✅ ~200 | — | n/a | — | — | COVERED |
| DI wiring / shared ApiClient | ✅ | — | — | n/a | — | — | COVERED |
| Network failure states | — | ✅ | — | n/a | — | — | COVERED |
| Admin dashboard (React) | ❌ | ❌ | ❌ | n/a | ❌ | ❌ | **MISSING — zero tests** |
| Rate limiting | — | — | — | ❌ (`skip: isTest`) | — | ❌ | **MISSING** |

**Structural notes.**
- The admin dashboard has **no test runner and no tests at all** (`admin/package.json` has no test
  script and no testing dependency).
- `test/api_integration_test.dart` is not hermetic: it needs a live backend on `localhost:4000` and
  specific seeded content, and it currently **fails** on a data condition (§1.6).
- Rate limiting is disabled in tests (`skip: () => isTest`), so neither limiter is exercised.

---

# STEP 12 — SECURITY TRIPWIRE

*Findings only. Nothing was fixed, and no live exploitation was attempted; every item below is
grounded in the code path named.*

> **Status as of 2026-08-25 (re-verified against the code):** S-3 is **fixed**. S-1, S-2, S-4, S-5,
> S-6, S-7, S-8 and S-9 are **all still present**. See §17 → *Production Blockers* for the current
> list with evidence.

### ✅ Probes that the code already defeats

| Probe | Why it fails | Evidence |
|---|---|---|
| Forged product price | `POST /orders` accepts no prices; lines are re-read inside the transaction | `createOrderSchema`, `orderService.create` |
| Forged delivery fee | Fee comes from the governorate/zone row | `orderService.create` |
| Forged discount / total | Computed in `orderRepo.create`; extra body keys are stripped by zod | `delivery-promo.test.ts` «ignores a discount or total forged by the client» |
| Forged order status | Client cannot set status; transitions validated against a fixed map | `applyStatusTransition` |
| Cross-user order read/cancel/confirm | Ownership checked; 404 (not 403) used so IDs can't be probed | `confirm-receipt.test.ts` «does not let another customer confirm someone else's order» |
| Cross-user collection/review/notification access | Owner-scoped SQL + explicit checks | `community.test.ts` (3 tests) |
| Anonymous upload | Both upload routers sit behind `authenticate` | `media.test.ts` «refuses anonymous uploads» |
| Wrong upload purpose | Non-admin restricted to `review`/`avatar` | `media.test.ts` «refuses customer uploads for admin-only purposes» |
| Polyglot / fake image | Magic-byte sniff overrides the declared MIME; extension follows the sniff | `media.test.ts` «rejects non-image bytes even when declared as an image» |
| Duplicate points | Two unique partial indexes | `uq_points_order_received`, `uq_points_review` |
| Duplicate birthday discount | `UNIQUE(user_id, used_year)`; a losing insert rolls back the order | `community.test.ts` |
| Duplicate order completion | `ALREADY_CONFIRMED` + `order.status !== 'COMPLETED'` guard on the award | `confirm-receipt.test.ts` |
| Double stock restore | `alreadyRejected` guard inside the transaction | `admin-integrity.test.ts` |
| Unauthorized admin endpoints | Single `requireAdmin` choke point on the router | `community.test.ts` «only admins can manage zones», «a customer cannot moderate reviews» |
| Guest access to protected endpoints | Router-level `authenticate` | `auth.test.ts` «blocks unauthenticated customer routes» |
| SQL injection via `sort` | Closed enum → fixed `ORDER BY` map; no interpolation | `catalog.test.ts` «an unknown sort value is rejected, never interpolated into SQL» |
| SQL injection generally | 100 % parameterised `$n` queries across all 17 repositories | reviewed by hand |
| Password disclosure | `toPublicUser` strips `password_hash` from every response | `userRepo.ts` |
| Internal-error disclosure | `httpError` collapses non-`AppError` to `INTERNAL_ERROR` | `utils/response.ts` |

### ⚠️ Findings

**S-1 · `P0` · Fixed OTP `123456` is the default, with no production guard.**
`config.verification.provider` defaults to `'development'` and `.env.example` ships that value. In
that mode `sendVerificationCode` always issues `config.verification.developmentCode` (`'123456'`).
There is no startup assertion that production uses a real provider, and no `sms` implementation
exists. Deployed as-is, **any phone number can be registered or password-reset by anyone**, because
`POST /auth/forgot-password` + `POST /auth/reset-password` with code `123456` is a full account
takeover. `authRateLimiter` (10 / 15 min per IP) is the only obstacle, and 5 attempts are allowed per
issued code.
*Files:* `backend/src/services/otpService.ts:29-40`, `backend/src/config/index.ts:23-28`,
`backend/.env.example:20-26`.

**S-2 · `P0` · Insecure default secrets.**
`config.jwtSecret` falls back to `'insecure_dev_secret_change_me'`; `databaseUrl` falls back to a
hardcoded credential. Nothing fails startup when `JWT_SECRET` is unset. `backend/scripts/seed.ts:169`
creates admin `07700000000 / admin123` and prints the credentials.
*Files:* `backend/src/config/index.ts:18`, `backend/scripts/seed.ts:169-180`.

**S-3 · `P1` · ~~Review `photoUrl` accepts arbitrary strings~~ — RESOLVED 2026-08-24.**
`reviewsService.assertOwnedPhoto()` now rejects any `photoUrl` that has no row in `media_files`
(`400 INVALID_PHOTO_URL`), on both submit and resubmit. Tests: «refuses a review photo that was
never uploaded to this server» and «accepts a review photo that really was uploaded». The original
finding is preserved below for the record.

**S-3 (original finding) · Review `photoUrl` accepts arbitrary strings and is displayed to every user.**
`submitReviewSchema.photoUrl` and `resubmitReviewSchema.photoUrl` are
`z.string().trim().max(500).nullish()` — no URL format check, no origin allow-list, and no lookup
against `media_files`. A client can submit any 500-character string. That value is stored in
`reviews.photo_url` and, once an admin approves the review, served to **all** users through
`GET /catalog/community/photos` and rendered by `Image.network` in the Flutter app and by antd
`<Image src>` in the admin `ReviewsPage`. Consequences: arbitrary third-party image hosting under the
store's brand, IP-address leakage of every viewer to an attacker-controlled host, and a broken-image
denial of quality. Compare `backend/src/validators/admin.ts:6-14`, where admin image URLs **must**
match `https?://…` or start with `/uploads/`. Moderation is the only barrier, and moderators see the
image rendered rather than the URL.
*Files:* `backend/src/validators/community.ts:8-14,22-26`.

**S-4 · `P1` · `avatarUrl` accepts any external origin.**
`updateProfileSchema.avatarUrl` is `z.string().url()` — a well-formed URL on any host is accepted and
stored in `users.avatar_url`, with no check that it came from `POST /uploads`. Same class of issue as
S-3 but lower blast radius.
*File:* `backend/src/validators/auth.ts:37-40`.

**S-5 · `P1` · `products.rating` and `review_count` are directly writable by the API.**
`adminProductUpdateSchema` accepts `rating` (0–5) and `reviewCount`, and `adminService.updateProduct`
writes them. This lets an admin publish a rating no customer produced. The admin **form** disables
both fields (`ProductForm.tsx:325,333`), so today this is only reachable by calling the API directly —
but the DB trigger will silently overwrite the value on the next moderation, so the two sources of
truth also disagree in the meantime.
*Files:* `backend/src/validators/admin.ts:84-85`, `backend/src/services/adminService.ts:130-146`.

**S-6 · `P2` · Uploads share the global rate limiter only.**
`POST /api/uploads` and `POST /api/admin/uploads` are covered by `globalRateLimiter`
(300 / 15 min / IP) with a 5 MB cap and no per-user quota, no total-storage cap, and no cleanup. One
authenticated customer can write ~1.5 GB per 15-minute window from a single IP, and nothing ever
deletes the files.
*Files:* `backend/src/app.ts:27`, `backend/src/middleware/upload.ts`.

**S-7 · `P2` · Rate limiting is IP-only and unbounded per identity.**
Both limiters key on IP. Behind a proxy or CGNAT this either over-blocks legitimate users or
under-blocks an attacker with address rotation. Notably there is **no per-phone throttle** on
`register` / `forgot-password` / `resend-code`, so one attacker IP gets 10 OTP issuances per window
spread across 10 different victim phone numbers. `app.set('trust proxy', …)` is never configured, so
behind a reverse proxy every request may be attributed to the proxy's IP.
*File:* `backend/src/middleware/error-handler.ts:29-52`.

**S-8 · `P1` · Account-status changes do not invalidate live tokens.**
JWTs live 7 days with no denylist and no `jti`. `authenticate` only verifies the signature. Suspending
a user (`PATCH /admin/users/:id/active`) blocks login and `GET /auth/me`, but **every other**
authenticated route — placing orders, uploading, reviewing — keeps working until the token expires.
Same for a password change: old tokens remain valid.
*File:* `backend/src/middleware/auth.ts:16-38`.

**S-9 · `P3` · User enumeration on the auth surface.**
`POST /auth/forgot-password` and `POST /auth/resend-code` return `409 «هذا الرقم غير مسجّل»` for
unknown numbers, confirming which phone numbers have accounts. `POST /auth/login` correctly returns a
generic message, so the inconsistency is what makes this exploitable.
*File:* `backend/src/services/authService.ts:57,73`.

### Not applicable / by design
No payment integration exists (cash on delivery only), so there is no card-data surface. There is no
file-download path that accepts a client-supplied path — `express.static` is rooted at `uploadsRoot`
and `LocalDiskStorage.remove` re-resolves and checks the prefix.

---

# STEP 13 — FINAL MASTER MATRIX

| # | Feature | Customer UI | Flutter | API | Backend | DB | Admin | Tests | Status | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Registration + OTP verify | ✅ | ✅ | ✅ | ⚠️ no SMS | ✅ | ❌ | ✅ | PARTIAL | P0 |
| 2 | Login | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 3 | Session persistence / restore | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 4 | Logout + state wipe | ✅ | ✅ | n/a | n/a | n/a | n/a | ⚠️ | COMPLETE | P0 |
| 5 | Forgot / reset password | ✅ | ✅ | ✅ | ⚠️ no SMS | ✅ | ❌ | ✅ | PARTIAL | P0 |
| 6 | Change password | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | COMPLETE | P1 |
| 7 | Change username / avatar | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | COMPLETE | P1 |
| 8 | Guest mode + auth guards | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | COMPLETE | P0 |
| 9 | 401 handling | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | COMPLETE | P0 |
| 10 | Theme | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | COMPLETE | P3 |
| 11 | Language ar/ckb | ✅ | ⚠️ 18 keys | n/a | n/a | n/a | n/a | ✅ | PARTIAL | P2 |
| 12 | RTL | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | COMPLETE | P1 |
| 13 | Onboarding (once) | ✅ | ✅ | n/a | n/a | n/a | ❌ | ✅ | COMPLETE | P3 |
| 14 | Offline gate | ✅ | ✅ | n/a | n/a | n/a | n/a | ✅ | COMPLETE | P2 |
| 15 | Home aggregate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 16 | Home promo rail | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY | P3 |
| 17 | Home delivery strip | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY | P3 |
| 18 | Categories + subcategories | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | P1 |
| 19 | Product list + filters | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 20 | Product sorting | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P2 |
| 21 | Product detail | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | PARTIAL | P1 |
| 22 | Product images | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 23 | Product options | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | P2 |
| 24 | Previous price / discount % | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 25 | Ratings aggregation | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ writable | ✅ | PARTIAL | P1 |
| 26 | Search | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 27 | Recent searches | ✅ | ✅ | n/a | n/a | n/a | n/a | ❌ | COMPLETE | P3 |
| 28 | Search suggestions | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY | P3 |
| 29 | Loading / empty / error states | ✅ | ✅ | n/a | n/a | n/a | ✅ | ✅ | COMPLETE | P2 |
| 30 | Cart CRUD + stock validation | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 31 | Cart promo display | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | BROKEN | P1 |
| 32 | Favorites | ✅ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ✅ | PARTIAL | P1 |
| 33 | Collections | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | COMPLETE | P2 |
| 34 | Order creation | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P0 |
| 35 | Order lifecycle + transitions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 36 | Stock restore on reject/cancel | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 37 | Order cancellation (customer) | ❌ | ❌ | ✅ | ✅ | ✅ | n/a | ✅ | ORPHANED | P2 |
| 38 | Receipt confirmation | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 39 | "Received success" screen | ❌ | ❌ | n/a | ✅ | ✅ | n/a | ⚠️ | MISSING | P3 |
| 40 | Order history / details | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 41 | Order status history timeline | ⚠️ | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | PARTIAL | P2 |
| 42 | Rejection reason | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 43 | ETA / delivery note | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ presets | ✅ | PARTIAL | P2 |
| 44 | Checkout address + phone | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 45 | Checkout full-name field | ❌ | ❌ | ❌ | ❌ | ⚠️ | n/a | ❌ | MISSING | P3 |
| 46 | Governorates | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | P1 |
| 47 | Delivery zones | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 48 | Delivery promo (server) | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 49 | Delivery promo (client preview) | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | BROKEN | P1 |
| 50 | Free-delivery state | ✅ | ⚠️ post-order | ⚠️ | ✅ | ✅ | ✅ | ✅ | PARTIAL | P2 |
| 51 | Order success screen | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE | P2 |
| 52 | Galaxy points balance + ledger | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL | P1 |
| 53 | Points duplicate prevention | n/a | n/a | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P0 |
| 54 | Otaku levels + rewards | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY | P2 |
| 55 | Birthday date + discount | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL | P1 |
| 56 | Birthday once-per-year | n/a | n/a | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P0 |
| 57 | Review create + photo | ✅ | ✅ | ⚠️ unvalidated URL | ✅ | ✅ | ✅ | ✅ | PARTIAL | P1 |
| 58 | Review moderation + reasons | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 59 | Review points | n/a | n/a | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 60 | Community feed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 61 | Community category filter | ❌ | ❌ | ✅ | ✅ | ✅ | n/a | ✅ | BACKEND ONLY | P2 |
| 62 | Community pagination | ❌ | ❌ | ❌ | ❌ | ✅ | n/a | ❌ | MISSING | P2 |
| 63 | Community photo viewer | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ⚠️ | COMPLETE | P2 |
| 64 | Notification list + read state | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | PARTIAL | P1 |
| 65 | Notification creation (events) | n/a | n/a | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 66 | Manual admin notification | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ORPHANED | P2 |
| 67 | Notification preferences | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | UI ONLY | P2 |
| 68 | Push notifications | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | MISSING | P2 |
| 69 | Franchises / anime taxonomy | ❌ | ⚠️ parsed only | ✅ | ✅ | ✅ | ⚠️ no image | ❌ | BACKEND ONLY | P2 |
| 70 | Store social links | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | COMPLETE | P2 |
| 71 | Avatar upload | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | COMPLETE | P1 |
| 72 | Avatar crop | ❌ | ❌ | n/a | n/a | n/a | n/a | ❌ | MISSING | P3 |
| 73 | Product / banner image upload | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 74 | Category image upload | n/a | n/a | ⚠️ wrong purpose | ✅ | ⚠️ | ✅ | ❌ | PARTIAL | P3 |
| 75 | Franchise image upload | n/a | n/a | ✅ | ✅ | ✅ | ❌ | ❌ | BACKEND ONLY | P3 |
| 76 | Media validation (MIME + magic) | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P0 |
| 77 | Media cleanup / GC | n/a | n/a | ❌ | ❌ | ⚠️ | ❌ | ❌ | MISSING | P2 |
| 78 | Admin dashboard stats | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ❌ | COMPLETE | P2 |
| 79 | Admin product management | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 80 | Admin category lifecycle | n/a | n/a | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ | PARTIAL | P2 |
| 81 | Admin subcategory lifecycle | n/a | n/a | ⚠️ create only | ⚠️ | ✅ | ⚠️ | ❌ | PARTIAL | P2 |
| 82 | Admin governorate lifecycle | n/a | n/a | ⚠️ | ⚠️ | ✅ | ⚠️ | ❌ | PARTIAL | P2 |
| 83 | Admin order management | n/a | n/a | ✅ | ✅ | ✅ | ⚠️ no promo row | ✅ | PARTIAL | P1 |
| 84 | Admin customer management | n/a | n/a | ✅ | ✅ | ✅ | ⚠️ | ❌ | PARTIAL | P2 |
| 85 | Admin review moderation | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 86 | Admin zones management | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | COMPLETE | P1 |
| 87 | Admin store settings | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ❌ | COMPLETE | P2 |
| 88 | Admin points visibility | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | **DONE (§21.1)** | P2 |
| 89 | Admin birthday visibility | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | **DONE (§21.2)** | P3 |
| 90 | Admin tests | n/a | n/a | n/a | n/a | n/a | ⚠️ | ⚠️ | **PARTIAL** — admin endpoints covered by backend tests; the React app still has no test runner (§21.8) | P2 |
| 91 | OTP SMS delivery | ✅ | ✅ | ✅ | ❌ | ✅ | n/a | ⚠️ dev code | MISSING | P0 |
| 92 | Production secrets hygiene | n/a | n/a | n/a | ⚠️ | n/a | n/a | ❌ | PARTIAL | P0 |
| 93 | Review photoUrl validation | n/a | n/a | ❌ | ❌ | ✅ | n/a | ❌ | MISSING | P1 |
| 94 | Token revocation on suspend | n/a | n/a | ❌ | ❌ | ✅ | ⚠️ | ❌ | MISSING | P1 |
| 95 | Rate limiting per identity | n/a | n/a | ⚠️ IP only | ⚠️ | n/a | n/a | ❌ | PARTIAL | P2 |

**Counts (95 audited features):**

| Status | Count |
|---|---|
| COMPLETE | 45 |
| PARTIAL | 27 |
| BROKEN INTEGRATION | 2 |
| MISSING | 12 |
| ORPHANED | 3 |
| UI ONLY | 4 |
| BACKEND ONLY | 3 |

| Priority | Count |
|---|---|
| P0 | 15 |
| P1 | 33 |
| P2 | 30 |
| P3 | 17 |

---

# STEP 14 — IMPLEMENTATION ROADMAP

*Dependency-ordered. Not executed.*

## Phase 0 — P0 · Security & authentication (blocks any production deployment)

| # | Item | Depends on | Notes |
|---|---|---|---|
| 0.1 | Implement an SMS provider behind `config.verification.provider` | provider account | The `sms` branch already exists in `otpService`; only the delivery call is missing (S-1) |
| 0.2 | Fail startup when `JWT_SECRET`, `DATABASE_URL`, or a real `VERIFICATION_PROVIDER` are unset in production | 0.1 | Removes the insecure fallbacks in `config/index.ts` (S-2) |
| 0.3 | Make `otpService` read `config.verification.lifetimeMinutes` / `maxAttempts` | 0.2 | Two documented env vars currently have no effect |
| 0.4 | Add per-phone throttling on `register` / `forgot-password` / `resend-code`; configure `app.set('trust proxy')` | 0.1 | S-7; needed before OTP is real, otherwise SMS cost is an attack surface |
| 0.5 | Remove the seeded admin password from `seed.ts` output; require an env-supplied admin password | — | S-2 |

## Phase 1 — P0/P1 · Financial & data integrity

| # | Item | Depends on | Notes |
|---|---|---|---|
| 1.1 | Validate `photoUrl` in `submitReviewSchema` / `resubmitReviewSchema`: require `/uploads/…` or `PUBLIC_BASE_URL`, and verify the row exists in `media_files` | — | S-3; mirrors the existing admin `imageUrl` validator |
| 1.2 | Apply the same rule to `updateProfileSchema.avatarUrl` | 1.1 | S-4 |
| 1.3 | Remove `rating` / `reviewCount` from `adminProductUpdateSchema` | — | S-5; the trigger is the only legitimate writer. Check no test asserts the current behaviour first |
| 1.4 | Invalidate tokens on suspend / password change (`users.token_version` in the JWT, checked by `authenticate`) | migration | S-8 |
| 1.5 | Make `forgot-password` / `resend-code` responses non-enumerating | — | S-9 |
| 1.6 | Add per-user upload quotas + a `media_files` GC job | 1.1 | S-6 + §8.5; 1.1 first, so ownership is knowable |

## Phase 2 — P1 · Backend completions (unblock Flutter work)

| # | Item | Depends on | Notes |
|---|---|---|---|
| 2.1 | Add `has_delivery_promo` + `delivery_promo_amount` to `cartRepo.LINE_SELECT` and `CartLine` | — | **Unblocks 4.1.** Pure additive SELECT; no migration |
| 2.2 | Add `deliveryPromoAmount` to `catalogService.productDetail` and the `discover` mapper — ideally collapse all three product mappers onto `catalogRepo.mapProduct` | — | §7.5; fixes §6-O.4 at the same time |
| 2.3 | Use `catalogRepo.mapProduct` in `favoriteRepo.list` | 2.2 | §7.6 |
| 2.4 | Add `deliveryPromoAmount` to `catalog.test.ts#PROMO_KEYS`, and a new test asserting the cart payload carries both promo fields | 2.1, 2.2 | Prevents regression of exactly the bug this audit found |
| 2.5 | Expose `statusHistory[]` on `GET /orders/:id` and `GET /admin/orders/:id` (customer view must omit `changed_by`) | — | §7.8; no migration |
| 2.6 | Add pagination (`page`/`limit` or a cursor) to `GET /catalog/community/photos` | — | §6-A.3 |
| 2.7 | Include `product_options` in `productRepo.list` when `includeInactive` is set | — | Removes the admin's public-endpoint workaround and the `INACTIVE_PRODUCT_OPTIONS_UNAVAILABLE` dead end |
| 2.8 | Add `deliveryDiscount` to the admin order DTO consumer type | 2.5 | So the admin breakdown reconciles |

## Phase 3 — P1/P2 · Admin controls

| # | Item | Depends on | Notes |
|---|---|---|---|
| 3.1 | Add a `deliveryDiscount` row to `OrderDetailPage` | 2.8 | Financial display correctness |
| 3.2 | Add `isActive` to `adminCategorySchema` + `adminGovernorateSchema`; switch `adminService.listGovernorates` to list **all** | — | §6-C.7, §6-C.8. Do these together — the list change without the field leaves rows visible but unfixable |
| 3.3 | Add `PATCH` / `DELETE /admin/subcategories/:id` | 3.2 | Decide soft vs hard delete (`products.subcategory_id` is `ON DELETE SET NULL`, so hard delete is safe) |
| 3.4 | Add an `ImageUploadField purpose="franchise"` to `FranchisesPage` | — | Makes `franchises.image_url` reachable |
| 3.5 | Add a `category` value to `media_files.purpose` (migration) and use it in `CategoriesPage` | migration | §7.12 |
| 3.6 | Build an admin notifications page (single-user + broadcast) | — | Activates the orphaned `POST /admin/notifications` |
| 3.7 | Build an admin order status-history view | 2.5 | Audit trail |
| 3.8 | ~~Build an admin points view (ledger + manual grant)~~ **DONE 2026-08-25 (§21.1)** — read-only; manual grant deliberately not built (§21.1). | — | §6-C.2 |

## Phase 4 — P1 · Flutter integrations

| # | Item | Depends on | Notes |
|---|---|---|---|
| 4.1 | Map the promo fields in `CartRepositoryImpl._mapLine`; render the per-item delivery-promo note in `cart_screen.dart` | **2.1** | §7.4 — the preview stays at 0 until 2.1 lands |
| 4.2 | Reconcile `order_review_screen.dart:246` with `OrderData.total` / `payableDelivery` | 4.1 | §6-E.4; becomes visibly wrong once 4.1 works |
| 4.3 | Add a `categoryId` parameter to `ReviewRepository.fetchApprovedPhotoReviews` + filter chips in `community_screen.dart` | — | §7.3; backend is ready today |
| 4.4 | Add `OrderRepository.cancelOrder` + a cancel action gated on `PENDING`/`CONFIRMED` | product decision | §7.7 — **the design has no cancel affordance; get a product call first** |
| 4.5 | Render a timestamped timeline in `order_detail_screen.dart` | 2.5 | §7.8 |
| 4.6 | Add community pagination / infinite scroll | 2.6 | §6-A.3 |
| 4.7 | Route notification taps on `reviewId` | — | Field is already returned |
| 4.8 | Decide and implement franchise browsing, or delete the taxonomy | product decision | §6-J — do not leave it half-wired |
| 4.9 | Clear `SearchHistoryStorage` in the `AuthUnauthenticated` branch of `app.dart` | — | §6-Q.1, one line |
| 4.10 | Surface cart-load failures instead of `catch (_) {}` | — | §6-R |

## Phase 5 — P2 · Configuration & edge cases

| # | Item | Depends on | Notes |
|---|---|---|---|
| 5.1 | ~~Move `POINTS_AWARDS`, `BIRTHDAY_DISCOUNT_PERCENT`, `LOW_STOCK_THRESHOLD` into `store_settings`~~ **DONE 2026-08-25 (§21.6)** for points, birthday % and rating delay. `LOW_STOCK_THRESHOLD` deliberately left in code — see §21.6. | 3.x | §10 config table |
| 5.2 | Design and implement notification preferences (table + endpoints + enforcement in producers) | 5.1 | §7.9 — first decide whether "points"/"birthday" toggles mean anything, since no such notifications exist |
| 5.3 | Levels: table or settings, exposed via `GET /points`, admin-editable, with an actual redemption mechanism | 5.1 + product decision | §7.10 — **the reward semantics are undefined; do not build until they are** |
| 5.4 | Push notifications (FCM/APNs + device-token table) | 5.2 | §6-A |
| 5.5 | Add the missing indexes from §8.2 | — | Independent; do under load measurement |
| 5.6 | Prune `verification_codes` on a schedule | — | §8.3.6 |
| 5.7 | Snapshot `orders.customer_name` at creation | migration | §8.7 |
| 5.8 | Normalise list-response shapes (`{items}` vs bare array vs `Paginated<T>`) | — | **Breaking change** — coordinate a client release |

## Phase 6 — P2 · Testing

| # | Item | Depends on |
|---|---|---|
| 6.1 | Make `test/api_integration_test.dart` hermetic: seed its own fixtures or drop the "every subcategory has products" invariant | — |
| 6.2 | Stand up a test runner for `admin/` (Vitest + Testing Library) and cover `patchProductFlags`, `StatusTransitionButtons`, and order totals | — |
| 6.3 | Widget tests for cart/checkout delivery-promo display | 4.1 |
| 6.4 | Backend tests for the S-3/S-4 URL validators | 1.1, 1.2 |
| 6.5 | Rate-limit tests behind an explicit opt-in flag rather than `skip: isTest` | 0.4 |
| 6.6 | Unit tests for `OtakuLevel` | — |

## Phase 7 — P3 · Visual QA & polish

| # | Item | Depends on |
|---|---|---|
| 7.1 | Extract the remaining ~350 strings into `AppStrings` + Kurdish translations (most already exist in the design's `t` dictionary) | — |
| 7.2 | Avatar crop screen (design #44) | — |
| 7.3 | "Received success" screen with the points celebration (design #59) | — |
| 7.4 | Admin-managed home promo tiles (replaces the hardcoded rail) | 5.1 |
| 7.5 | Server-driven search suggestions | — |
| 7.6 | Checkout full-name field, or an explicit decision to keep using `users.username` | product decision |
| 7.7 | Consume `banners.title` and `destination_type` in the Flutter banner carousel | — |
| 7.8 | Remove the dead code listed in §6-G | — |

**Critical dependency chain (the one that gates the most work):**
```
2.1 (cart payload)  →  4.1 (cart/checkout promo UI)  →  4.2 (review-screen totals)  →  6.3 (tests)
```
**Second chain:** `0.1 (SMS) → 0.2 (secret guards) → 0.4 (per-phone throttle)` — nothing ships to
production before all three.
**Third chain:** `1.1 (photoUrl validation) → 1.6 (upload quotas + GC)`.

---

# STEP 15 — FINAL VERIFICATION

Self-check performed against this document after writing it:

- ✅ **Every major customer-facing feature is represented** — auth (9), personalization (5), profile
  (6), catalog (15), cart (6), favorites (5), collections (7), orders (14), checkout (9), delivery
  promo (7), points (8), birthday (8), reviews (10), community (9), notifications (7), media (6).
- ✅ **Every backend domain is represented** — all 4 route files, all 10 controllers, all 15
  services, all 17 repositories, all 7 validator modules, all 3 middleware modules, the storage
  driver, and the config module are named in §1.3, §9, or §12.
- ✅ **Every admin page is represented** — all 15 routes audited individually in §10.
- ✅ **Every database domain is represented** — all 19 migrations and all 24 tables in §1.4 and §8.
- ✅ **The v2 HTML design was inspected** — 358,769 bytes; 28 screen states, 46 section blocks, and
  370 visible-text nodes extracted; 78 design features enumerated in §5; Arabic and Kurdish label
  dictionaries sampled for delivery-promo, points, birthday, checkout, community, and settings copy.
- ✅ **No implementation changes were made** — the only file created is this one. `git status`
  entries are pre-existing; the mtime changes noted in the header were caused by a concurrent editor,
  not by this audit.
- ✅ **No test was weakened** — both suites were executed unmodified and their real results are
  reported, including the one Flutter failure.

## Summary

| # | Metric | Value |
|---|---|---|
| 1 | Total features audited | **95** |
| 2 | COMPLETE | **45** |
| 3 | PARTIAL | **27** |
| 4 | BROKEN INTEGRATION | **2** |
| 5 | MISSING | **12** |
| 6 | ORPHANED | **3** |
| 7 | UI ONLY | **4** |
| 8 | BACKEND ONLY | **3** |
| 9 | P0 issues | **15** |
| 10 | P1 issues | **33** |
| 11 | P2 issues | **30** |
| 12 | P3 issues | **17** |

**13 · Most important dependencies**
1. `cartRepo.LINE_SELECT` promo fields → the entire cart/checkout delivery-promo UI. One SELECT
   change unblocks four Flutter items and a design gap that currently **overstates the customer's
   total**.
2. A real SMS provider → the whole authentication surface is unsafe to deploy without it (S-1).
3. `photoUrl` / `avatarUrl` validation → gates the upload-quota and media-GC work (S-3, S-4, S-6).
4. `statusHistory` exposure → both the customer timeline and the admin audit view.
5. A settings-backed configuration store → points, birthday, low-stock, levels, and promo tiles are
   all currently frozen in source.
6. Product decisions still owed before code: **what an Otaku level reward actually grants**, and
   **whether customer-initiated order cancellation should exist** (it is implemented and tested
   server-side but appears nowhere in the design).

**14 · Recommended implementation order**
```
Phase 0  P0 security & auth        (0.1 SMS → 0.2 secret guards → 0.3 → 0.4 → 0.5)
Phase 1  P0/P1 data integrity      (1.1 photoUrl → 1.2 avatarUrl → 1.3 rating → 1.4 tokens → 1.5 → 1.6)
Phase 2  P1 backend completions    (2.1 cart payload FIRST → 2.2 → 2.3 → 2.4 tests → 2.5 → 2.6 → 2.7 → 2.8)
Phase 3  P1/P2 admin controls      (3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8)
Phase 4  P1 Flutter integrations   (4.1 needs 2.1 → 4.2 → 4.3 → 4.5 needs 2.5 → 4.6 needs 2.6 → 4.7 → 4.9 → 4.10)
Phase 5  P2 configuration & edges  (5.1 settings store → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8)
Phase 6  P2 testing                (6.1 → 6.2 → 6.3 needs 4.1 → 6.4 needs 1.1 → 6.5 → 6.6)
Phase 7  P3 visual QA & polish     (7.1 l10n → 7.2 → 7.3 → 7.4 needs 5.1 → 7.5 → 7.6 → 7.7 → 7.8)
```
Items awaiting a product decision (4.4 cancellation, 4.8 franchises, 5.3 level rewards, 7.6 full
name) should be resolved during Phase 2 so they do not stall Phase 4 or Phase 5.

---

---

# STEP 15 — IMPLEMENTATION LOG

Entries below record changes made *after* the audit above. The audit sections remain as written;
only the rows those changes invalidate were edited (§1.6 test inventory, §5 row 3, §13 row 13).

## 2026-08-24 — ONBOARDING screen rebuilt against the visual reference

**Screen:** `/onboarding` → `OnboardingRoute` → `OnboardingScreen`. Reached from `SplashScreen`
when `OnboardingStorage.hasSeenOnboarding` is `false`. Shown once per install.

**Status:** `COMPLETE` (unchanged) — this was a **visual reconstruction**, not a functional change.

**Functional surface — deliberately unchanged.** The screen is entirely local: no API, no
controller, no service, no table, no admin surface. Its only persistence is
`OnboardingStorage` (`SharedPreferences`, key `has_seen_onboarding_v1`). No backend, database,
migration, admin, business-rule, authentication or authorization code was touched for this screen.

**Flutter files changed**
- `lib/features/onboarding/presentation/screens/onboarding_screen.dart` — rebuilt to the reference.
- `lib/core/design_system/components/buttons/anime_primary_button.dart` — **additive only**: new
  optional `borderRadius` parameter, defaulting to `AppDimens.radiusLg`. No existing caller changes
  behaviour.
- `test/onboarding_screen_test.dart` — **new**, 11 tests.

**Visual corrections applied** (reference + `Otaku Galaxy v2.dc.html` ONBOARDING block)
- Header: padding `20/22`, logo `36`, gap `10`, brand `Tajawal 800 / 14.5`.
- Per-slide radial background wash (was absent entirely).
- Glow circle repositioned to the source values (`top 24`, `start -64`, `270`), with the source's
  two-stop pink→violet gradient.
- Slide-1 art anchored top-start at `78%` of slide height (was centre-right at a fixed `320`).
- Floating chip moved to absolute `top 122 / end 15`; title and body both `15px`, body at light
  weight, both on `onSurface` — matching the source's `font-weight:200` second line.
- Page indicators: height `5` (was `8`), gap `7`, **start-aligned** (was centred), active pill `28`.
- Footer padding `24/6/30` with `16` gaps.
- «لدي حساب — تسجيل الدخول» now occupies its space on every slide but is transparent and
  `IgnorePointer`-wrapped except on the last slide, matching the source's `opacity:0;
  pointer-events:none`.
- CTA radius `r-m (22)` and gradient `pink → violet` left-to-right.

**Known deviation from the reference image (intentional):** the reference screenshot shows a dark
«الشاشات» chip at bottom-left. That is the prototype's screen picker; the design file labels it
«أداة معاينة — لن تظهر في التطبيق النهائي». It is **not** implemented.

**Newly discovered, not fixed (out of scope for this screen):** the global
`AppThemeColors.primaryGradient` runs `topRight → bottomLeft`, which is the mirror of the design's
`linear-gradient(135deg, pink, violet)`. This screen passes an explicit correctly-oriented gradient
to its CTA rather than changing the shared token. Every other gradient surface in the app is
currently mirrored relative to the design and should be reviewed when those screens are rebuilt.

**Tests executed**
- `flutter analyze` → clean.
- `flutter test` (all suites except the non-hermetic `api_integration_test.dart`) → **236 passed**.
- New `test/onboarding_screen_test.dart` → 11 passed: renders without layout overflow at
  320×640 / 375×812 / 412×892 in both light and dark under RTL; slide-1 text, chip and CTA content;
  three indicators with the first active; login link inert on slide 1 and active on slide 3;
  slide advance; `markSeen` persistence across a fresh storage instance.
- Backend `npm run typecheck`, `npm test` (73 passed), `npm run build` → all clean (regression
  guard only; no backend file was modified).
- Visual QA was performed by rendering the widget to PNG at 412 light, 412 dark and 320 light and
  comparing against the reference; the temporary capture harness was removed afterwards and no
  golden files were committed (they would be brittle across font/platform versions).

**Remaining limitations for this screen**
- The source's one-shot `og-art` entry animation on the character art is not reproduced; the
  continuous `og-float` on the chip is. Re-triggering an entry animation per `PageView` page would
  be visually noisier than the source.
- Slide 2 and 3 glow/chip coordinates were derived from the design file, not from a reference
  screenshot; only slide 1 has been visually verified against an image.
- No admin control over onboarding content — matches the design, which has none.

## 2026-08-24 — Reference-screenshot reconstruction, batch 1 (8 of 20 screens)

A set of 20 reference screenshots became the visual source of truth. Batch 1 covers 8 of them.
Verification method for every screen: render the real widget to PNG at 412×892 with the project's
Tajawal/Cairo/MaterialIcons fonts and the real asset bundle, then compare against the reference.

**Screens brought to the reference:** onboarding slides 1–3, login, personalize, galaxy points,
account, favorites.

**Behavioural / structural changes (not purely cosmetic)**
- `AppLanguage.kurdish.label` `'کوردی'` → `'كوردي'`. The reference writes it in Arabic letters, and
  Tajawal has no glyph for the Persian ک — it was rendering as tofu on the personalize cards.
- `AnimeProductCard` gained a `compact` variant (name + price only). The design's favorites card has
  no stock pill, rating or delivery-promo line; the full card was being used there.
- Galaxy points: removed the gradient level-summary card — the reference places that on **account**,
  not on points. The explainer card was a list of point awards; the reference is an "i" + paragraph
  («شنو هي نقاط المجرّة؟»). Level rows now read «مستوى N — الاسم» with an `N+` threshold, and the
  current level uses a pink-8% fill + pink border instead of a full gradient.
- Account: rows reordered to the reference (طلباتي → المفضلة → الإعدادات) and المفضلة now shows a
  **real** count from the already-loaded `FavoritesCubit` (no extra request).
- Onboarding: slides 2 and 3 place their title/body at the **top** of the slide, not the bottom —
  the previous build used one bottom-text template for all three. Each slide is now its own
  composition in `onboarding_slides.dart`.
- `AnimePrimaryButton` gained optional `borderRadius` (additive, defaults unchanged).
- New `AuthField` for auth screens: label **above** the field, no prefix icons, `dir=ltr` hint for
  phone numbers. The shared `AnimeTextField` puts the label inside and adds icons the design has not.

**Known deviation from the references (intentional)**
- The dark «الشاشات» chip in every screenshot is the prototype's screen picker; the design file
  labels it «أداة معاينة — لن تظهر في التطبيق النهائي». Not implemented.
- Favorites and account show a bottom navigation bar in the references. In this app they are pushed
  routes, not tabs, so they render a back button instead. Changing that is a navigation-architecture
  change and was left alone.

**Blocked**
- Account «تقييماتي» row (reference shows it with a count): no destination exists. The design
  prototype points it at the rate-order screen, which requires an order argument. Adding the row
  without a working destination would be a dead control, so it was not added.
- Account «طلباتي» count badge would need an orders fetch on the account screen; not added.

**Tests:** `flutter analyze` clean · `flutter test` **242 passed** · `flutter build web` clean ·
backend untouched in this batch.

**Not yet reconstructed (12 screenshots):** home + receipt-confirmation sheet, received-success,
rate-order, write-review sheet (empty and filled), review-submitted, review-approved, orders list,
and order detail in its received / received-scrolled / rejected / pending states.

---

## 2026-08-24 — Reference-screenshot reconstruction, batch 2

Second set of 20 reference screenshots. Verified by rendering each real widget to PNG at 412×892
with the project's Tajawal/Cairo/MaterialIcons fonts and real assets, then comparing to the
reference.

**Brought to the reference this batch:** register, cart (empty state), notifications, order-success.
OTP had its code corrected but could **not** be visually captured (see limitations).

**Design-system change**
- New `AppColors.ctaGradient` (`pink → violet`, top-left → bottom-right). Every reference CTA shows
  pink on the physical left; the app-wide `primaryGradient` runs the other way. `ctaGradient` is
  deliberately **separate** from `primaryGradient` rather than flipping it, because the references
  show gradient *surfaces* (account profile card) running the opposite direction to gradient
  *buttons*. Adopted by onboarding, login, personalize, register, OTP, order-success, and the shared
  empty-state action.

**Shared component changes**
- `AnimeEmptyState`: was vertically centred; the design anchors the panel to the **top** with a
  ~380 height (clamped to 260 on short screens), and places the action button at the panel's
  bottom-start rather than inline under the text. Affects cart / favorites / orders / community
  empty states — all of which the design lays out this way.
- `AuthField` now also used by register (was login-only).

**Copy corrected to the references**
- Cart: «0 منتجات في السلة», «السلة فاضية», «خذ جولة بالمتجر…», «استكشف المنتجات».
- Notifications: «تعليم الكل كمقروء»; time buckets reduced to the design's three
  (اليوم / هذا الأسبوع / أقدم) — an extra «أمس» bucket was being produced.
- Order success: «تم إرسال طلبك» (emoji removed), «بانتظار الموافقة», «الخطوات الجاية»,
  step labels, «متابعة التسوق», and Arabic-Indic step numerals ١ ٢ ٣.
- Register/OTP: header back-arrow removed (the references show only the logo; the
  «عندك حساب؟ تسجيل الدخول» link and the system back gesture remain as navigation).

**Tests:** `flutter analyze` clean · `flutter test` **242 passed** · `flutter build web` clean ·
backend untouched.

**Limitation:** the OTP screen cannot be captured by the widget harness — its resend countdown uses
`Future.doWhile` with real delays, leaving a pending timer that fails at teardown. Its changes
(CTA gradient, artwork box, header) were applied but are **not** visually verified.

**Still not reconstructed** (~27 screenshot slots across both batches): home (header / hero /
offers), category products + subcategory chips, product detail (3 states), community, collections
tab, bottom navigation bar, offline gate, login-gate sheet, review-rejected, orders list, order
detail (4 states), rate-order, write-review (2 states), review-submitted, review-approved,
received-success, and the home + receipt-confirmation sheet.

---

## 2026-08-24 — Order → delivery → rating lifecycle completed end-to-end

**Scope.** Close the remaining gaps in the purchase flow so the customer app, backend, database and
admin dashboard all agree on one state machine, and so the rating step is driven by server time
rather than by anything the client can influence.

### What was already working (verified, not rebuilt)
Cart CRUD with server-side stock validation · transactional order creation with server-authoritative
pricing (`POST /api/orders` accepts no prices at all) · the six-state order machine with a single
enforcement point · stock restore on rejection/cancellation · backend-originated order notifications
· review submission, moderation, points award/revoke, and the product-rating trigger. These were
re-run, not re-implemented.

### What was actually missing, and what was built

**1. Rating window (the headline gap).** Ratings previously opened the instant an order hit
`COMPLETED`; the requirement is one day after delivery.
- Migration `020_delivery_and_rating_window.sql` adds `orders.delivered_at`,
  `orders.rating_available_at`, `orders.rating_reminder_sent_at`, three CHECK constraints
  (pair-consistency, window-not-before-delivery, reminder-needs-window) and a partial index for the
  scheduler.
- `orderRepo.markDelivered()` stamps both timestamps inside the same transaction that completes the
  order, guarded by `delivered_at IS NULL` so re-applying `COMPLETED` cannot shift the window.
- Time is computed by PostgreSQL (`now() + make_interval(...)`), not by Node — no dependence on the
  app server's clock or timezone.
- `reviewsService.submit()` rejects an early rating with `409 RATING_NOT_YET_AVAILABLE`.
- Delay is `config.orders.ratingDelayHours` (env `ORDER_RATING_DELAY_HOURS`, default 24).

**Migration safety:** historical `COMPLETED` orders are backfilled with
`rating_available_at = delivered_at`, i.e. they stay immediately ratable. The new delay applies only
to orders delivered after the upgrade — a server upgrade must not revoke a right a customer already
had. They are also stamped `rating_reminder_sent_at = now()` so the scheduler does not blast every
historical customer on first boot.

**2. Scheduled rating reminder.** No job/cron/queue infrastructure existed anywhere in the backend.
- New `src/jobs/ratingReminderJob.ts`. `dispatchDueRatingReminders()` claims due rows and inserts the
  notifications in **one** statement (`UPDATE … RETURNING` feeding an `INSERT … SELECT`), with
  `FOR UPDATE SKIP LOCKED` so running more than one API instance cannot double-send.
- `startRatingReminderScheduler()` is called from `server.ts` only — never from `createApp()` — so
  the test suite never starts a background timer. The interval handle is `unref()`ed.
- Due-ness is derived entirely from database state, so a restart loses nothing and repeats nothing;
  `rating_reminder_sent_at` is the idempotency guard. This satisfies the "must survive app close,
  phone restart, offline, and a week's absence" requirement without any client timer.

**3. Order tracking with real timestamps.** `order_status_history` was written on every transition
since migration 006 but never exposed. Orders now return
`statusHistory: [{status, note, createdAt}]` — deliberately **without** `changed_by`, so the customer
cannot see which administrator acted. Flutter stamps each journey step; admin renders an antd
`Timeline`.

**4. Cart delivery-promo chain.** Documented in the audit as `BROKEN INTEGRATION`: the Flutter
checkout computed a delivery discount from fields the cart endpoint never sent, so it always
evaluated to zero and the customer was shown a **higher** total than the server would charge.
`LINE_SELECT` now carries `has_delivery_promo` / `delivery_promo_amount` and Flutter maps them.

**5. Review photo ownership (security finding S-3).** `photoUrl` accepted any 500-character string
and, once approved, that URL was served to every user of the community feed. `assertOwnedPhoto()`
now requires a matching `media_files` row on submit and resubmit. This reuses `mediaRepo.findByUrl`,
which the audit had flagged as dead code.

**6. Error surfacing.** `write_review_screen._submit()` caught every failure and showed one generic
"try again", hiding `RATING_NOT_YET_AVAILABLE`, `REVIEW_EXISTS` and `INVALID_PHOTO_URL`. It now maps
the server's `error.code` to a specific message and falls back to the server's own text.

**7. Admin totals.** `AdminOrder` was missing `deliveryDiscount`, so with a promo applied the printed
breakdown did not sum to the printed total. Added as its own row, plus delivery/rating timestamps.

**8. `GET /api/admin/orders` was returning 500 — pre-existing, found during this work.**
`adminController.listOrders` parsed the status filter with
`updateOrderStatusSchema.partial().pick({ status: true })`. `updateOrderStatusSchema` carries a
`.refine()` (rejection reason mandatory), and Zod refuses `.partial()` on a refined object —
so **every** call to the endpoint threw and the global error handler turned it into
`500 INTERNAL_ERROR`. The admin Orders page and the dashboard's recent-orders panel were therefore
dead, and had been since `adminController.ts` was last edited on 2026-08-23.

No test touched this route, which is exactly why the audit's 73 green tests did not reveal it. Fixed
by reusing the existing `listOrdersSchema` — the same schema the customer route already uses, so the
status filter is now defined once. Five regression tests were added for the endpoint (unfiltered
list, status filter, invalid status → 400, customer → 403, totals reconcile).

### Order state machine (unchanged shape, now fully observable)

```
PENDING_ADMIN_CONFIRMATION ─┬─→ CONFIRMED ─┬─→ PREPARING ─┬─→ OUT_FOR_DELIVERY ─┬─→ COMPLETED
                            │              │              │                     │      │
                            └─→ REJECTED ←─┴──────────────┴─────────────────────┘      │
                                                                                        ↓
                                                        delivered_at := now()  ·  rating_available_at := now() + 24h
                                                                                        ↓
                                                        (scheduler) receiptReminder notification
                                                                                        ↓
                                             review: pending ──→ approved (published + points)
                                                             └─→ rejected (reason; editable, resubmits as pending)
```

`COMPLETED` and `REJECTED` are terminal. `ORDER_STATUS_TRANSITIONS` in `backend/src/types/index.ts`
is the single definition; the admin dashboard mirrors it for button rendering only, and the server
rejects anything outside it with `409`.

### API changes
No new endpoints. Four response additions on existing order reads
(`GET /api/orders`, `GET /api/orders/:id`, `GET /api/admin/orders`, `GET /api/admin/orders/:id`):
`deliveredAt`, `ratingAvailableAt`, `ratingAvailable`, `statusHistory[]`.
Cart reads (`GET/POST /api/cart`, `PATCH/DELETE /api/cart/:id`) add `hasDeliveryPromo` and
`deliveryPromoAmount` per line. All additive — no field was removed or renamed.

New error codes: `RATING_NOT_YET_AVAILABLE` (409), `INVALID_PHOTO_URL` (400).

### Files changed
- **Backend:** `migrations/020_delivery_and_rating_window.sql` (new), `jobs/ratingReminderJob.ts`
  (new), `config/index.ts`, `repositories/orderRepo.ts`, `repositories/cartRepo.ts`,
  `services/orderService.ts`, `services/reviewsService.ts`, `controllers/adminController.ts`,
  `server.ts`.
- **Flutter:** `orders/domain/entities/order.dart`, `cart/data/repositories/cart_repository_impl.dart`,
  `orders/presentation/screens/order_detail_screen.dart`,
  `reviews/presentation/screens/write_review_screen.dart`, `core/utils/formatters.dart`.
- **Admin:** `types/orders.ts`, `pages/OrderDetailPage.tsx`.
- **Tests:** `tests/order-rating-lifecycle.test.ts` (new, 13 tests), `tests/helpers.ts`
  (`fastForwardRatingWindow`, `registerUploadedPhoto`), `tests/community.test.ts`,
  `tests/community-filter.test.ts`.

### Tests
`npm test` (backend) — **10 files, 91 tests, all passing.**
`flutter analyze` — clean · `flutter test` — **251 passing, 1 pre-existing failure**
(`api_integration_test.dart`, the «ميداليات» data-state assertion documented in §1.6) ·
`npx tsc --noEmit` and `npm run build` (admin) — clean.

**Live end-to-end run** against the running dev server (not just supertest), verifying in order:
signup → cart (promo fields present on the line) → order placed with a **forged**
`total: 1, discount: 999999` in the body, both ignored by the server → admin sees it →
`PENDING → COMPLETED` refused `409` → customer calling the admin route refused `403` → full
lifecycle walk → `deliveredAt` stamped and window opening in exactly 24.0 h → 5-entry
`statusHistory` with no `changedBy` leak → early rating refused `RATING_NOT_YET_AVAILABLE` →
window fast-forwarded → scheduler dispatched 1 reminder, second run dispatched 0 → reminder visible
in the notification centre → forged photo refused `INVALID_PHOTO_URL` → rating accepted as
`pending` → not publicly visible → duplicate refused `REVIEW_EXISTS` → admin publishes →
publicly visible, `product.rating = 5`, `reviewCount = 1` → `reviewApproved` notification →
points balance 21 (20 receipt + 1 review).

Four pre-existing review tests began failing when the rating gate landed, because they submitted a
review immediately after completing an order. They were **not** relaxed: a `fastForwardRatingWindow()`
helper shifts `delivered_at` and `rating_available_at` equally into the past, so the production rule
stays enforced and the test is the thing that moves time. Two more began failing on the photo check
because they used fabricated URLs; they now register a real `media_files` row via
`registerUploadedPhoto()`.

### Known limitations
- **No UI to mark delivery from the customer side beyond the existing confirm-receipt action** —
  unchanged from before; admin `OUT_FOR_DELIVERY → COMPLETED` and customer confirm-receipt both work
  and share one code path.
- **Notification type reuse:** the rating reminder is a `receiptReminder`, not a dedicated
  `ratingReminder` type (rationale above). If a distinct icon/filter is ever wanted, it needs a CHECK
  migration plus a Flutter enum change.
- **Scheduler is in-process.** Correct and safe for multiple instances thanks to
  `FOR UPDATE SKIP LOCKED`, but if the API is scaled to zero (serverless), reminders stop until an
  instance runs. A real queue/cron would be the next step at that point.
- **Push notifications remain absent** — reminders land in the in-app centre only. Unchanged scope;
  still tracked as `MISSING` in §13.
- **`POST /orders/:id/cancel` is still orphaned** in the Flutter client (§6-F). Left alone
  deliberately: the visual design has no cancel affordance, so shipping one is a product decision,
  not a gap to silently fill.
- `test/api_integration_test.dart` remains non-hermetic (live server + mutable dev data + auth rate
  limiter). See §1.6.

---

---

## 2026-08-25 — "Added to cart" confirmation stayed on screen forever

**Symptom.** After adding a product, «تمت إضافة المنتج إلى السلة» appeared and never went away.

**Root cause — a Flutter framework default, not a missing timer.** The snackbar already passed
`duration: const Duration(seconds: 3)` and already called `hideCurrentSnackBar()` first, so the
obvious suspects were all clean. The real cause is in `SnackBar`'s constructor
(`flutter/lib/src/material/snack_bar.dart:303`, Flutter 3.47.1):

```dart
persist = persist ?? action != null;
```

`SnackBar.persist` defaults to **true whenever the snackbar has an action**, and
`ScaffoldMessengerState.build()` creates the dismiss timer with this body
(`scaffold.dart:619`):

```dart
_snackBarTimer = Timer(snackBar.duration, () {
  if (snackBar.persist) {
    return;                     // ← fires, does nothing, snackbar stays
  }
  hideCurrentSnackBar(reason: SnackBarClosedReason.timeout);
});
```

This snackbar carries an action («عرض السلة»), so `persist` silently became `true`: the timer ran
to completion after three seconds and then returned without hiding anything. The declared duration
was dead code. This is a Material-3 behaviour change (snackbars offering an action are expected to
wait for the user); the screen was written against the older default.

An audit of every `SnackBar` in `lib/` found **exactly one** with an action — this one — so no other
message in the app is affected.

**Fix.** Pass `persist: false` explicitly. The action button, colours, shape, margin, icon and copy
are untouched, so the visual design is unchanged.

While fixing it the snackbar was moved out of `_ProductDetailScreenState` into
`showAddedToCartSnack(BuildContext)` in the existing
`lib/features/cart/presentation/cart_actions.dart` — beside `addToCartGuarded`, which the same
screen already uses. No new notification system was introduced; this only makes the widget reachable
from a test and available to any future quick-add entry point.

**Not a leak.** `ScaffoldMessenger` owns the timer and cancels it in its own `dispose`, and
`hideCurrentSnackBar()` before each show replaces rather than stacks. No `Timer`, `setState` or
`mounted` handling was added — adding one would have been a second workaround stacked on a framework
default that simply needed to be set correctly.

**Files:** `lib/features/cart/presentation/cart_actions.dart`,
`lib/features/product_detail/presentation/screens/product_detail_screen.dart`,
`test/added_to_cart_snack_test.dart` (new).

**Tests:** `test/added_to_cart_snack_test.dart` — 8 tests covering appear-then-auto-dismiss and
still-visible-before-timeout in **both** light and dark, a second add replacing rather than stacking
the first, five rapid adds collapsing to one message that still dismisses, navigating to another
route while visible, and full tree teardown while visible (no exception, no post-dispose update).

Verified the tests are not vacuous: with `persist: false` removed, **6 of the 8 fail**; with it
restored, all 8 pass.

`flutter analyze` clean · `flutter test` **259 passing, 1 pre-existing failure**
(`api_integration_test.dart`, §1.6).

---

## 2026-08-25 — Order submission fix · admin-controlled delivery reminder · birthday prompt

### 1. Order submission failure — root cause

**Symptom.** «تعذر إرسال الطلب، حاول مرة أخرى» on pressing «تأكيد إرسال الطلب».

**It was not a backend fault.** Reproduced against the running server: a well-formed order creates
fine. The failing payload is the one the checkout screen actually builds when the customer never
opens the governorate picker.

`order_data_screen` renders «المحافظة» and «منطقة التوصيل» with `_pickerRow` — a tappable row, **not
a `FormField`** — so `_formKey.currentState!.validate()` never sees them. `_continue()` guarded only
`!formValid || _zoneMissing`, so a missing governorate passed straight through and
`OrderData(governorateId: _governorateId ?? '')` sent `governorateId: ""`. The server correctly
answered `400 VALIDATION_ERROR` / «اختر محافظة صالحة» — and `order_review_screen`'s `catch (_)`
replaced that precise message with the generic one, which is why the failure looked inexplicable.

Reproduction (live server):
```
POST /api/orders  {"governorateId":"", ...}
→ 400  {"code":"VALIDATION_ERROR"}  «اختر محافظة صالحة»
```

**A second, narrower path** had the same shape: `_loadZones()` caught any failure and set
`_zones = []`, which is indistinguishable from "this governorate has no zones". For a zoned
governorate (النجف) a network hiccup therefore let the customer through with no zone, and the server
rejected with `ZONE_REQUIRED` after the whole form was filled.

**Fixes.**
- `_continue()` now also blocks on `_governorateMissing` and `_zonesFailed`, and a `_submitted` flag
  keeps fields un-reddened until the customer actually presses continue.
- `_pickerRow` takes `errorText` instead of a bool `hasError` (its message had been hardcoded to the
  zone text), so the governorate row states its own «يرجى اختيار المحافظة».
- `_loadZones()` distinguishes failure from emptiness: `_zonesFailed` shows a `_ZonesRetryNotice`
  with a retry and blocks continue, rather than guessing.
- `order_review_screen` surfaces the server's own message, mapping `ZONE_REQUIRED`,
  `ZONE_INVALID`/`ZONE_NOT_SUPPORTED` and `BIRTHDAY_DISCOUNT_USED`, and falling back to
  `error.message`.

### 2. Admin order visibility
Already fixed and recorded in the previous entry (`GET /api/admin/orders` was 500 for everyone).
Re-verified here end-to-end: order created from the client payload → visible in
`?status=PENDING_ADMIN_CONFIRMATION` with correct customer, items, quantity and server-computed
total → admin walked it to `COMPLETED` → customer read back the new status.

### 3. Delivery-confirmation reminder — admin-controlled — **implemented**

Extends the existing scheduler; no second notification system was introduced.

| Capability | Where |
|---|---|
| Default 24 h after delivery | `config.orders.ratingDelayHours`, stamped at `COMPLETED` |
| Per-order reschedule | `PATCH /api/admin/orders/:id/reminder` — `{delayHours}` **or** `{remindAt}`, never both |
| Send immediately | `POST /api/admin/orders/:id/reminder/send-now` |
| Sent state | `ratingReminderSentAt` on the order DTO |

**Why rescheduling cannot leave a stale pending reminder:** nothing is ever held in process memory.
The scheduler reads `rating_available_at` from the row on each pass, so moving the column *is* the
reschedule. There is no old timer to cancel.

**Duplicate prevention** is a single database guard, `orders.rating_reminder_sent_at`, written in the
*same* statement that inserts the notification (`UPDATE … RETURNING` feeding `INSERT … SELECT`).
Manual send and scheduled send use the identical guard, so they cannot both fire; the periodic path
additionally uses `FOR UPDATE SKIP LOCKED` so multiple API instances take disjoint batches. Pressing
«إرسال الإشعار الآن» twice returns `409 REMINDER_ALREADY_SENT` on the second press.

Rescheduling after the reminder has gone out is refused (`REMINDER_ALREADY_SENT`), and a reminder for
an undelivered order is refused (`ORDER_NOT_DELIVERED`). Both endpoints sit behind
`authenticate + requireAdmin`; a customer token gets `403`, no token `401`.

**Routing.** The reminder is inserted with `order_id`, and
`notifications_screen._openNotification()` routes on `orderId` → `OrderDetailRoute` — the screen that
holds both the receipt-confirmation prompt and the rating entry. The destination comes from the
envelope, never from parsing the notification text.

**Naming note.** The reminder reuses the existing 24-hour post-delivery job (`receiptReminder`,
«شلونها المنتجات؟»), which is the only scheduled reminder in the system. The in-card
«هل استلمت طلبك؟» prompt on `OUT_FOR_DELIVERY` is a separate, unscheduled UI affordance and was not
touched.

### 4. Birthday prompt on first delivered order — **implemented**

Reuses the existing columns and endpoints — `users.birth_day` / `birth_month` / `birthday_set_at`,
`GET`/`POST /api/birthday`. No new profile field, no second birthday system.

The sheet previously lived as a private method inside `account_screen`; it is now
`showBirthdayPrompt()` in `lib/features/birthday/presentation/birthday_prompt.dart`, and both
entry points call it. `order_detail_screen._promptBirthdayIfDue()` runs right after a successful
receipt confirmation, gated on `isUnlocked && !hasBirthday`.

**Both conditions are server-derived**, which is what makes the "show it once, ever" rule hold:
`unlocked` comes from `COUNT(*) FROM orders WHERE status='COMPLETED' > 0`, and `hasBirthday` from the
stored column — read through `GET /api/birthday`. `SharedPreferences` plays no part in the decision,
so reinstalling, logging in on another device, or logging out and back in does not resurrect the
prompt. The server also enforces set-once (`BIRTHDAY_ALREADY_SET`) and unlock-after-first-order
(`BIRTHDAY_LOCKED`).

### 5. "Added to cart" duration
Reduced from 3 s to **1500 ms**; `persist: false` (the previous entry's fix) is unchanged. The
widget tests were re-pointed at the shorter window.

### APIs
Added: `PATCH /api/admin/orders/:id/reminder`, `POST /api/admin/orders/:id/reminder/send-now`
(both admin-only). Order DTO gains `ratingReminderSentAt`. No endpoint was removed or renamed.
**No migration was required** — the columns landed in `020_delivery_and_rating_window.sql`.

### Files changed
- **Backend:** `repositories/orderRepo.ts` (`rescheduleReminder`, `ratingReminderSentAt`),
  `jobs/ratingReminderJob.ts` (`sendRatingReminderNow`), `services/orderService.ts`,
  `controllers/adminController.ts`, `routes/admin.ts`, `validators/orders.ts`.
- **Admin:** `types/orders.ts`, `api/ordersApi.ts`, `pages/OrderDetailPage.tsx`
  (`ReminderControls`: 1/6/12/24/48 h presets, custom date-time, send-now with confirm, sent-state
  alert).
- **Flutter:** `checkout/.../order_data_screen.dart`, `checkout/.../order_review_screen.dart`,
  `birthday/presentation/birthday_prompt.dart` (new), `account/.../account_screen.dart`,
  `orders/.../order_detail_screen.dart`, `cart/presentation/cart_actions.dart`.
- **Tests:** `tests/order-rating-lifecycle.test.ts` (+10 reminder tests),
  `test/added_to_cart_snack_test.dart`.

### Tests
Backend `npm test` — **101 passing**. `flutter analyze` clean · `flutter test` — **259 passing,
1 pre-existing failure** (`api_integration_test.dart`, §1.6). Admin `tsc --noEmit` + `npm run build`
clean.

Live end-to-end against the running server: empty-governorate payload still refused with a legible
reason · valid order created and present in the customer's history · visible to admin with correct
customer/items/quantity/total · walked to `COMPLETED` and the customer saw it · default delay
measured at 24.0 h · admin reset it to 6.0 h · customer `PATCH` refused `403` · three presses of
send-now → `200, 409, 409` with exactly **1** notification carrying `orderId` · scheduler run three
more times after the manual send dispatched **0** each time, total stays 1 · birthday
`unlocked=true, hasBirthday=false` → saved 14/3 → fresh login shows `hasBirthday=true` (prompt will
not reappear) → second attempt refused `BIRTHDAY_ALREADY_SET`.

### Status
| Item | Status |
|---|---|
| Order submission fix | Implemented, verified |
| Admin order visibility | Implemented, verified |
| Reminder default 24 h | Implemented, verified |
| Admin-adjustable timing (presets + custom) | Implemented, verified |
| Send-now + duplicate prevention | Implemented, verified |
| Reminder deep-link to the order | Implemented, verified server-side |
| Birthday prompt + server persistence | Implemented, verified |
| Push notifications | **Not implemented** — in-app centre only, unchanged |
| Flutter UI click-through | **Not performed** — see limitation below |

**Limitation — UI verification.** Every phase above was verified through the real HTTP API, database
and scheduler, plus widget tests. A visual click-through of the Flutter screens was **not** performed:
the Browser pane cannot composite frames in this environment, and Flutter web renders to canvas so
there is no DOM to drive. The Flutter-side changes (checkout guards, birthday prompt trigger, admin
reminder card) are covered by `flutter analyze`, the widget suite, and the server contracts they call,
but not by an on-device run.

---

## 2026-08-25 — Media URL architecture · app-entry delivery confirmation · dynamic rating gate · birthday registry

### 1. Product / category / profile images never loaded on device — one root cause

`LocalDiskStorage.save()` returned an **absolute** URL built from `PUBLIC_BASE_URL`
(`http://localhost:4000/uploads/...`) and that string was frozen into `product_images.url`,
`categories.image_url`, `users.avatar_url`, `banners.image_url` and `reviews.photo_url` at upload
time.

The Flutter app resolves its API base per platform — `10.0.2.2:4000` on Android, `localhost:4000`
elsewhere — so on a phone `localhost` is *the phone*. Every admin-uploaded image was therefore
unreachable, while the seeded `https://placehold.co/...` products kept working, which is exactly the
reported "admin images don't show but the app looks fine".

The system was already *designed* for relative refs — `validators/admin.ts` accepts
`value.startsWith('/uploads/')` and says so — but the storage driver contradicted it.

**Fix — one representation, one resolver per consumer.**
- `LocalDiskStorage` now returns `/uploads/<key>`; `publicBaseUrl` is no longer baked in.
- Migration `021_relative_media_urls.sql` rewrites existing rows across all eight columns via
  `regexp_replace(..., '^https?://[^/]+(/uploads/)', '\1')`, so any host (not just localhost) is
  normalised. External URLs are untouched — the predicate matches `/uploads/` only.
- Flutter: `lib/core/network/media_url.dart` — `resolveMediaUrl()` / `resolveMediaUrls()`, origin
  configured once in DI from the same `AppConfig` the API client uses. Applied at model boundaries
  (`Product`, `Category`, `Banner`, `User`, `Review`, cart line, order item) so every existing widget
  keeps working unchanged.
- Admin: `src/utils/media.ts` — same rule against `VITE_API_BASE_URL`. It is a **display-only**
  helper; forms still save the raw relative ref, because converting before save would re-bake an
  origin and reintroduce the bug.
- `updateProfileSchema.avatarUrl` was `z.string().url()`, which rejects a relative ref — it would have
  blocked every avatar save after the switch. It now accepts `/uploads/...` or an absolute URL, the
  same rule the admin image validator already used.

### 2. Delivery confirmation on app entry — implemented

`GET /api/orders/pending-confirmation` returns the customer's oldest `OUT_FOR_DELIVERY` order, or
`null`. Order status *is* the pending question, so nothing is stored locally: confirming moves the
order to `COMPLETED` and the endpoint stops returning it, permanently and across devices.

`MainNavigationScreen` checks after first frame **and** on `AppLifecycleState.resumed`, guarded by
`_askingConfirmation` so a resume mid-sheet cannot stack a second one. "لم أستلمه بعد" is remembered
in memory for the session only — the order genuinely is still out for delivery, so the question
should return next launch rather than be suppressed on the server.

Answering "نعم" routes to `OrderDetailRoute(confirmOnOpen: true)` rather than confirming inside the
sheet, so points, the birthday prompt and the rating hand-off stay on one path instead of being
duplicated. The notification tap route is unchanged and lands on the same screen.

The sheet (`delivery_confirmation_sheet.dart`) follows the supplied reference: title + subtitle,
artwork right, a bordered row showing «قيد التوصيل» and the order total, then
«نعم، استلمت الطلب» and «لم أستلمه بعد».

### 3. Rating availability made genuinely dynamic

The visible bug: after confirming receipt the app pushed `RateOrderRoute` **unconditionally**, so the
customer reached a write-review form the server would refuse with `RATING_NOT_YET_AVAILABLE`.
Now it navigates only when `updated.ratingAvailable`; otherwise it stays on the order screen, whose
card shows «التقييم متاح بعد …» computed from the backend's `ratingAvailableAt`.

Remaining hardcoded copy was removed: the `remaining == null` fallback no longer claims "بعد يوم",
and the review-submit error now surfaces the server's own text. `formatRemaining` gained Arabic
singular/dual/plural, so it reads «٥ ساعات» rather than «٥ ساعة».

**The clock is never restarted.** `orderRepo.markDelivered` writes `delivered_at` and
`rating_available_at` under `WHERE delivered_at IS NULL`, so no later transition moves the window —
covered by «does not move the rating window when COMPLETED is re-applied».

**Scheduler and UI cannot disagree** because they read the same column: `ratingAvailable` is
`rating_available_at <= now()` computed server-side, and the reminder job selects on that column.
Verified live: an admin reschedule to +1 h moved the reminder *and* the rating gate together.

> Note on the stated Scenario A (admin marks delivered, then the customer presses "استلمت الطلب"
> an hour later): that sequence cannot occur — once an admin moves the order to `COMPLETED`, the
> customer's confirm-receipt returns `409 ALREADY_CONFIRMED` and the prompt is not shown. The
> underlying invariant it is asking for — never restart the window — is enforced and tested.

### 4. Cart toast — tap to dismiss
The content is wrapped in a `GestureDetector` calling
`messenger.hideCurrentSnackBar(reason: SnackBarClosedReason.dismiss)`. The messenger is captured
before the snackbar is shown, so dismissal is safe even if the originating screen is gone.
`ScaffoldMessenger` cancels its own timer inside `hideCurrentSnackBar`, so there is no timer of ours
to leak. Duration is 1500 ms; `persist: false` from the earlier fix is unchanged.

### 5. Admin birthday registry — implemented
`GET /api/admin/customers/birthdays` (admin-only, paginated) reads the **existing** `users.birth_day`
/ `birth_month` / `birthday_set_at` — no second field, no new table. It adds `completedOrders` (why
the option opened) and `discountUsedThisYear`. It exposes name, phone, avatar and birthday only — no
password hash, no address. New page at `/birthdays` with a nav entry, ordered by month then day.

The once-only rule is unchanged and server-enforced: `unlocked` from completed-order count,
`hasBirthday` from the column, `BIRTHDAY_ALREADY_SET` on a second attempt.

### Database
`021_relative_media_urls.sql` — data normalisation only, no schema change. No other migration.

### APIs
Added: `GET /api/orders/pending-confirmation` (customer),
`GET /api/admin/customers/birthdays` (admin). Changed: `updateProfileSchema.avatarUrl` now accepts
relative refs. All media fields now carry `/uploads/...` instead of an absolute URL — a
**representation change** consumers must resolve; both shipped clients do.

### Files changed
- **Backend:** `storage/index.ts`, `validators/auth.ts`, `repositories/orderRepo.ts`,
  `repositories/userRepo.ts`, `services/orderService.ts`, `services/adminService.ts`,
  `controllers/orderController.ts`, `controllers/adminController.ts`, `routes/customer.ts`,
  `routes/admin.ts`, `migrations/021_relative_media_urls.sql` (new).
- **Flutter:** `core/network/media_url.dart` (new), `core/di/injection_container.dart`,
  `core/constants/api_endpoints.dart`, `core/utils/formatters.dart`, entities
  (`product`, `category`, `banner`, `user`, `review`, `order`), `cart_repository_impl.dart`,
  `order_repository.dart` + impl, `orders/presentation/widgets/delivery_confirmation_sheet.dart`
  (new), `main_navigation_screen.dart`, `order_detail_screen.dart`, `write_review_screen.dart`,
  `cart_actions.dart`, `app_router.gr.dart` (regenerated).
- **Admin:** `utils/media.ts` (new), `types/birthdays.ts` (new), `pages/BirthdaysPage.tsx` (new),
  `api/customersApi.ts`, `App.tsx`, `layouts/nav.tsx`, and the eight render sites now resolving refs.
- **Tests:** `tests/order-rating-lifecycle.test.ts` (+8), `test/media_url_test.dart` (new, 5),
  `test/added_to_cart_snack_test.dart` (+2).

### Tests
Backend **109 passing** · Flutter **266 passing, 1 pre-existing failure**
(`api_integration_test.dart`, §1.6) · `flutter analyze` clean · admin `tsc -b` + `vite build` clean.

Live end-to-end: pending-confirmation `null` → order id once `OUT_FOR_DELIVERY` → `null` again after
confirming · confirm-receipt left the window at **24.0 h** and `ratingAvailable=false` · admin
reschedule to **1.0 h** moved reminder and rating gate together · early rating refused
`RATING_NOT_YET_AVAILABLE` · admin product upload returned `/uploads/...`, persisted through admin
list and public API, file served `200` · avatar upload saved and returned relative, served `200` ·
birthday registry lists the customer with no private fields, prompt does not reappear.

### Status
| Item | Status |
|---|---|
| Media URL architecture (product / category / avatar) | Implemented, verified |
| Delivery confirmation on app entry | Implemented, verified server-side |
| Dynamic rating gate | Implemented, verified |
| Cart toast tap-to-dismiss | Implemented, widget-tested |
| Admin birthday registry | Implemented, verified |
| Push notifications | **Not implemented** (unchanged) |
| Flutter UI click-through | **Not performed** — see below |

**Limitation.** Everything above was verified through the real API, database, migration and widget
tests. A visual pass over the Flutter screens was **not** possible here: the Browser pane cannot
composite frames and Flutter web renders to canvas. The new sheet's pixel fidelity to the supplied
reference, and the on-device appearance of the now-resolvable images, still need one manual run.

---

# STEP 17 — CURRENT IMPLEMENTATION AUDIT

**Audit date: 2026-08-25.** Every claim in this section was checked against the code on that date.
Where it disagrees with §1–§15, **this section wins** — those sections are the original audit plus a
dated change log, and some of their statements are now historical.

## 17.1 Verification run (real numbers, this date)

| Check | Command | Result |
|---|---|---|
| Backend tests | `npm test` in `backend/` | **10 files, 115 tests, all passing** |
| Flutter analyzer | `flutter analyze` | **No issues found** |
| Flutter tests | `flutter test` | **276 tests — 275 passing, 1 failing** |
| Admin types | `npx tsc --noEmit` | clean |
| Admin build | `npm run build` | clean |
| Migrations | `schema_migrations` | **23 applied** |

**The one failing Flutter test** is
`test/api_integration_test.dart › أقسام الإكسسوارات والحقائب`. It asserts that *every* subcategory of
«إكسسوارات»/«حقائب» contains at least one product; the dev database has a subcategory «ميداليات»
with no products, and `backend/scripts/seed.ts` never creates it.

- **Classification: pre-existing, environment/data-dependent. Not a regression.** It was failing in
  the very first audit run on 2026-08-24, before any of this work.
- It was **not** modified to go green. The file is not hermetic — it needs a live backend on
  `localhost:4000` *and* specific mutable data — which is the actual defect (§17.5, `T-1`).

Note also that this suite exercises the auth rate limiter (10 requests / 15 min / IP). Running it
repeatedly in quick succession produces extra spurious 401/429 failures that disappear once the
window drains. Those are environmental, not code faults.

---

## 17.2 Delivery confirmation — `IMPLEMENTED`

**API:** `GET /api/orders/pending-confirmation` (customer, JWT required).
Returns the caller's **oldest** order in `OUT_FOR_DELIVERY`, or `null`. One order at a time, ordered
by `created_at`, so a customer with several deliveries in flight is asked about them in sequence
rather than getting stacked prompts.

**Source of truth is the order row.** There is no "pending confirmation" flag anywhere — the status
`OUT_FOR_DELIVERY` *is* the pending question, and confirming moves the order to `COMPLETED` so the
endpoint stops returning it. Nothing is written to `SharedPreferences` to decide this, so the
behaviour is identical after reinstall, on another device, and after logout/login.

**App entry (`MainNavigationScreen`):** checked in `addPostFrameCallback` after the first frame and
again on `AppLifecycleState.resumed` — "opening the app" covers returning from background, not only
a cold start. Guarded by `_askingConfirmation` so a resume while the sheet is open cannot stack a
second one. Only runs when `AuthCubit.isLoggedIn`.

**"لم أستلمه بعد"** is remembered in an in-memory `Set` for the session only. Deliberate: the order
genuinely *is* still out for delivery, so the question should return on the next launch rather than
be suppressed server-side.

**"نعم، استلمت الطلب"** does **not** confirm inside the sheet. It routes to
`OrderDetailRoute(orderId, confirmOnOpen: true)`, which runs the same `_confirmReceived` path as the
in-screen button — so points, the birthday prompt and the rating hand-off exist once, not twice.
`_confirmOnOpenPending` is consumed once and re-checks `status == delivering` after load, so a
reload cannot re-fire it and a status change between screens is handled.

**Notification tap** is unchanged: `notifications_screen._openNotification()` routes on the
envelope's `orderId` → `OrderDetailRoute`. Both entry points therefore land on the same screen for
the same order.

**UI:** `orders/presentation/widgets/delivery_confirmation_sheet.dart` — title + subtitle, artwork,
a bordered row showing «قيد التوصيل» and the order total, then the two actions. Built to the supplied
reference; **pixel fidelity is unverified** (§17.4).

## 17.3 Dynamic rating availability — `IMPLEMENTED`

> ⚠️ **Superseded 2026-08-25 by §18.6.** The description below was accurate for the previous
> implementation, in which the window was anchored to the `COMPLETED` transition. It is now anchored
> to **dispatch** (`OUT_FOR_DELIVERY`). Read §18.6 for current behaviour.

**The backend owns the timestamp.** On the first transition into `COMPLETED`,
`orderRepo.markDelivered()` writes:

```sql
UPDATE orders
   SET delivered_at = now(),
       rating_available_at = now() + make_interval(hours => $2)
 WHERE id = $1 AND delivered_at IS NULL
```

`WHERE delivered_at IS NULL` is what makes it once-only. Both timestamps are computed by PostgreSQL,
not Node, so they do not depend on the app server's clock or timezone. Delay is
`config.orders.ratingDelayHours` (env `ORDER_RATING_DELAY_HOURS`, default 24).

**Flutter never computes `now + 24h`.** `Order.ratingAvailable` and `Order.ratingAvailableAt` are
parsed straight from the response; `Order.timeUntilRating` subtracts from `ratingAvailableAt`, and
`_ReviewInvite` renders «التقييم متاح بعد {formatRemaining(...)}». Grepping `lib/` for `24` returns
only design tokens (icon sizes, spacing) — **no hardcoded rating delay anywhere in the client**; the
only `24` in the rating path is the backend default `config.orders.ratingDelayHours`. Reopening the screen refetches the order, so the remaining time is recalculated from server
state rather than a surviving local countdown.

**After confirming receipt, navigation is gated:**

```dart
if (updated.ratingAvailable) {
  await context.router.push(RateOrderRoute(order: updated));
}
```

Previously this push was unconditional, which dropped the customer onto a form the server would
refuse. When the window is still closed the app now stays on the order screen showing the real
remaining time.

**Server-side gate:** `reviewsService.submit` rejects with `409 RATING_NOT_YET_AVAILABLE` when
`!order.ratingAvailable`.

**Invariant confirmed during testing:** once an order is `COMPLETED`, a further confirm-receipt is
rejected with `409 ALREADY_CONFIRMED`. Combined with the `delivered_at IS NULL` guard, there is no
path by which a customer's button press restarts the rating window.

> The scenario "admin marks delivered, then the customer presses استلمت الطلب an hour later and gets
> a fresh 24 h" **cannot occur**: once the admin completes the order the confirm-receipt endpoint
> refuses and the prompt is not shown. The invariant it protects against is enforced regardless.

**Scheduler and UI cannot disagree** — structurally, not by convention. `ratingAvailable` is
`rating_available_at <= now()` evaluated in the same SELECT that returns the order, and
`dispatchDueRatingReminders()` selects on the same column. An admin reschedule moves both together;
verified live.

## 17.4 Cart success message — `IMPLEMENTED`

`showAddedToCartSnack()` in `lib/features/cart/presentation/cart_actions.dart` — the app's single
add-to-cart confirmation, using the existing `ScaffoldMessenger`. No second notification system.

- **Auto-dismiss:** `duration: 1500 ms`, `persist: false`. The `persist` flag is essential — in
  Flutter 3.47 `SnackBar` sets `persist = persist ?? action != null`, so any snackbar with an action
  (this one has «عرض السلة») would otherwise fire its timer and return without hiding, staying on
  screen forever.
- **Tap to dismiss:** the content is wrapped in a `GestureDetector` calling
  `messenger.hideCurrentSnackBar(reason: SnackBarClosedReason.dismiss)`. The messenger is captured
  *before* the snackbar is shown, so dismissal is safe even if the originating screen is gone.
- **Replacement:** `hideCurrentSnackBar()` runs before each show, so a second add replaces rather
  than queues.
- **No leak:** there is no timer of ours. `ScaffoldMessenger` owns and cancels it, including in its
  own `dispose`. No `setState`-after-dispose path exists because no state of ours outlives the sheet.

Covered by 10 widget tests in `test/added_to_cart_snack_test.dart` (light + dark, rapid adds,
tap-dismiss, navigate-away, full teardown).

## 17.5 Media / image architecture — `IMPLEMENTED`

### The rule
**One representation everywhere: a relative reference, `/uploads/<key>`.** Each consumer resolves it
against the origin *it* knows. External absolute URLs pass through untouched.

### Why
`LocalDiskStorage.save()` used to return `${PUBLIC_BASE_URL}/uploads/<key>` and that absolute string
was frozen into the database at upload time. Flutter resolves its API base per platform —
`10.0.2.2:4000` on Android, `localhost:4000` elsewhere — so on a phone `localhost` is *the phone*.
Every admin-uploaded image was unreachable on device, while seeded `https://placehold.co/...`
products kept working. The codebase was already written for relative refs (`validators/admin.ts`
accepts `/uploads/…` and says so in its comment); the storage driver contradicted that intent.

### Current pieces
| Layer | Behaviour |
|---|---|
| Storage | `LocalDiskStorage.save()` returns `/uploads/<purpose>/<YYYY>/<MM>/<uuid><ext>` |
| Database | relative refs only for uploaded media; external URLs untouched |
| Migration `021` | `regexp_replace(raw, '^https?://[^/]+(/uploads/)', '\1')` over 8 columns — strips **any** host, not just localhost |
| Flutter | `lib/core/network/media_url.dart` → `resolveMediaUrl()` / `resolveMediaUrls()`, origin set once in DI from the same `AppConfig` the API client uses |
| Admin | `admin/src/utils/media.ts` → `resolveMediaUrl()` against `VITE_API_BASE_URL` |

### Why forms must save the raw reference
The admin helper is **display-only**. If a form resolved before saving, it would write an
origin-bearing absolute URL back into the database and reintroduce exactly the bug that was fixed.
`ImageUploadField` and `ImagesEditor` therefore resolve for the `<Image src>` preview but keep the
raw relative value in form state.

### Consumers actually wired (verified by grep, not assumed)
**Flutter (7):** `Product.images`, `Category.imageUrl`, `Banner.imageUrl`, `User.avatarUrl`,
`Review.photoUrl`, cart line `productImage` (`cart_repository_impl`), order item `imageUrl`
(`Order._mapItem`).

**Admin (10 render sites):** `ImageUploadField`, `ImagesEditor`, `ProductsPage`, `CategoriesPage`,
`BannersPage`, `ReviewsPage`, `OffersPage`, `DashboardHome`, `OrderDetailPage`, `CustomersPage`,
plus `BirthdaysPage`.

Resolution happens at the **model boundary** in Flutter, so every existing widget kept working with
no change.

### Schema change required for avatars
`updateProfileSchema.avatarUrl` was `z.string().url()`, which rejects a relative reference — it would
have blocked every avatar save after the switch. It now accepts `/uploads/…` **or** an absolute
`http(s)` URL, matching the rule `validators/admin.ts` already used. **No new column, no second
avatar field** — `users.avatar_url` is reused.

### Verified end-to-end (live server, 2026-08-25)
Admin uploads product image → returns `/uploads/...` → persists through the admin list → same value
on the public API → file serves `200` → resolves correctly for both a `localhost` and a `10.0.2.2`
origin. Same for an avatar: upload → `PATCH /auth/me` → `GET /auth/me` returns the relative ref →
file serves `200`. Database counts confirm uploaded refs are relative while seeded external URLs
(21 `product_images` rows on `placehold.co`) are untouched.

**Cache behaviour is unchanged** — the app uses `Image.network` with Flutter's default image cache.
Because a new upload produces a new UUID filename, a changed image is a different URL and cannot be
served stale. Re-uploading to the *same* key is not possible through any current path.

## 17.6 Birthday — `IMPLEMENTED`

**No duplicate field.** The existing `users.birth_day`, `users.birth_month`, `users.birthday_set_at`
(migration `013`) are reused. There is no second birthday column and no separate table.

**Business rule, enforced server-side:**
- `unlocked` is derived from `COUNT(*) FROM orders WHERE status='COMPLETED' > 0` — the prompt cannot
  appear before the first delivered order.
- `hasBirthday` comes from the stored column.
- `birthdayService.setBirthday` refuses a second attempt with `409 BIRTHDAY_ALREADY_SET`, and
  `birthdayRepo.setBirthday` updates under `WHERE birth_day IS NULL AND birth_month IS NULL`.
- `users_birthday_pair` CHECK forces day and month to be set together.

Because both conditions come from `GET /api/birthday`, the "ask once, ever" rule survives reinstall,
another device, and logout/login. `SharedPreferences` plays no part in the decision.

**Prompt trigger:** `order_detail_screen._promptBirthdayIfDue()` runs immediately after a successful
receipt confirmation, gated on `isUnlocked && !hasBirthday`. The sheet itself lives once, in
`lib/features/birthday/presentation/birthday_prompt.dart` (`showBirthdayPrompt()`); `account_screen`
calls the same function, so there is a single implementation.

**Admin section:** `GET /api/admin/customers/birthdays` (admin-only, paginated, max 50/page) and the
`/birthdays` page, ordered by month then day. Exposed fields: username, phone, avatar, birth day and
month, `birthdaySetAt`, `completedOrders`, `discountUsedThisYear`. **Not exposed:** password hash,
address, order contents, or any other private data.


## 17.7 Notifications & scheduler — `PARTIAL` (in-app only)

**One system, reused throughout.** All notifications are rows in `notifications`, created
server-side, read by the customer through `GET /api/notifications`. There is no parallel notification
mechanism anywhere in the codebase.

**Producers (all backend-originated):**
| Trigger | Type |
|---|---|
| Order → `CONFIRMED` | `orderAccepted` |
| Order → `OUT_FOR_DELIVERY` (body = admin ETA note) | `deliveryUpdate` |
| Order → `COMPLETED` | `receiptReminder` |
| Order → `REJECTED` | `orderRejected` |
| Review approved / rejected | `reviewApproved` / `reviewRejected` |
| Rating reminder when the window falls due | `receiptReminder` («شلونها المنتجات؟») |
| Manual admin notification | `promotion` — **endpoint exists, no admin UI calls it** |

**Scheduler:** `backend/src/jobs/ratingReminderJob.ts`, started from `server.ts` only (never from
`createApp()`, so tests never spawn a timer), interval `RATING_REMINDER_INTERVAL_MS` (default 5 min),
handle `unref()`ed.

**Duplicate prevention is a single database guard**, `orders.rating_reminder_sent_at`, written in the
*same statement* that inserts the notification:

```sql
WITH due AS (UPDATE orders SET rating_reminder_sent_at = now() WHERE id IN (... FOR UPDATE SKIP LOCKED) RETURNING id, user_id)
INSERT INTO notifications (...) SELECT ... FROM due RETURNING id
```

- **Restart-safe:** due-ness is derived from database state, never process memory. A restart loses
  and repeats nothing.
- **Multi-instance-safe:** `FOR UPDATE SKIP LOCKED` gives each instance a disjoint batch.
- **Manual vs scheduled cannot both fire:** `sendRatingReminderNow()` uses the identical guard, so
  whichever writes the column first wins. Repeat presses return `409 REMINDER_ALREADY_SENT`.
- **Rescheduling leaves nothing pending:** there is no in-memory timer to cancel — moving
  `rating_available_at` *is* the reschedule.

**Limitations (real, not planned):**
- **No push notifications.** No FCM/APNs dependency in `pubspec.yaml`, no device-token table, no push
  code. Everything is in-app pull-only — the customer sees a reminder when they next open the app.
  The delivery-confirmation-on-open check (§17.2) is what compensates for this today.
- The rating reminder reuses `receiptReminder` rather than a dedicated type. A distinct type would
  need a CHECK migration plus a matching Flutter enum change.
- `backInStock` has no producer at all — an unused enum value.
- Notification preferences (`NotificationPrefsStorage`, 6 toggles) are **device-local and have no
  effect**: nothing sends them to the server and no producer consults them.

## 17.8 Admin Dashboard — current state

18 declared routes in `App.tsx` — 16 pages plus `/login` and the `*` catch-all. Per-area status as
of this audit:

| Area | State |
|---|---|
| Orders list + detail | Working. Status counts, filter, full detail |
| Order status transitions | Working, mirrors the server map; rejection note mandatory; 4 hardcoded ETA presets |
| Order totals | Working — includes the `deliveryDiscount` row, so the breakdown reconciles with the total |
| Order status timeline | Working — antd `Timeline` from `statusHistory`, plus delivery/rating timestamps |
| Delivery-reminder controls | Working — 1/6/12/24/48 h presets, custom date-time, «إرسال الإشعار الآن» with confirm, and a sent-state alert that locks the controls |
| Birthday customers | Working — new `/birthdays` page |
| Products | Working incl. image upload, options, promo fields. `rating`/`reviewCount` shown **disabled** |
| Categories | **Partial** — create/edit only. No activate/deactivate, no delete, no subcategory edit/delete. The page states this in an `Alert` |
| Governorates | **Partial** — create/edit only; `listGovernorates()` still calls `governorateRepo.listActive`, so a deactivated governorate is invisible and unrecoverable from the UI |
| Banners, Zones, Reviews, Settings, Offers, Customers | Working |
| Franchises | **Partial** — no image field, so `franchises.image_url` is unreachable |
| Notifications | **Missing** — no page; the endpoint is orphaned |
| Points / birthday configuration | **Missing** — no admin visibility into `points_ledger`, no way to tune award values or the birthday percentage |
| Tests | **None.** `admin/package.json` has no test script and no testing dependency |

## 17.9 End-to-end verification performed

Run against the live development backend on 2026-08-25. Each line was observed, not inferred.

| Flow | Result |
|---|---|
| Pending confirmation: none → order id once `OUT_FOR_DELIVERY` → `null` after answering | ✅ |
| Pending confirmation: oldest-first with two in-flight orders | ✅ (backend test) |
| Pending confirmation: never leaks another customer's order; `401` without a token | ✅ |
| Confirm receipt → window opens at **24.0 h**, `ratingAvailable=false` | ✅ |
| Admin reschedule to **1.0 h** → reminder *and* rating gate move together | ✅ |
| Rating before the window → `409 RATING_NOT_YET_AVAILABLE` | ✅ |
| «إرسال الإشعار الآن» ×3 → `200, 409, 409`, exactly 1 notification carrying `orderId` | ✅ |
| Scheduler run 3× after a manual send → dispatched 0 each time | ✅ |
| Product image: upload → admin list → public API → serves `200` → resolves for both origins | ✅ |
| Category image: same pipeline | ✅ |
| Avatar: upload → `PATCH /auth/me` → `GET /auth/me` → serves `200` | ✅ |
| Birthday: prompt condition true → saved → fresh login shows `hasBirthday=true` → second attempt `409` | ✅ |
| Birthday registry lists the customer, no private fields | ✅ |
| Order submission with `governorateId: ""` → `400` with a legible message | ✅ |
| Forged `total`/`discount` in the order body → ignored, server total used | ✅ |
| Cart toast: auto-dismiss, tap-dismiss, replacement, teardown | ✅ (10 widget tests) |
| Media resolver: relative → absolute, external passthrough, empty handling | ✅ (5 widget tests) |

**Not performed: any on-device or visual run.** See §17.11.

---

## 17.10 IMPLEMENTED & VERIFIED

Genuinely complete, exercised against the real backend and database:

- Authentication (register, OTP verify, login, session restore, logout, forgot/reset, change password)
- Guest browsing and auth guards
- Catalog: home, categories, products, product detail, search, sorting, filtering
- Cart CRUD with server-side stock validation, including delivery-promo fields on cart lines
- Checkout with governorate/zone validation and server-authoritative pricing
- Order creation (transactional, client prices ignored), full status machine, stock restore on
  rejection/cancellation
- Admin order management: list, filter, detail, transitions, totals that reconcile, status timeline
- Order status history exposed with timestamps and **without** `changed_by`
- Delivery timestamps and the rating window
- Delivery confirmation on app entry (§17.2)
- Dynamic rating availability (§17.3)
- Admin-controlled reminder timing + send-now + duplicate prevention (§17.7)
- Reviews: submit, moderate, resubmit, points award/revoke, product-rating trigger
- Review photo ownership check (closes S-3)
- Community feed **with category filtering**
- Galaxy points ledger with SQL-enforced duplicate prevention
- Birthday: prompt trigger, set-once, server persistence, admin registry (§17.6)
- Media architecture: one relative representation + per-consumer resolver (§17.5)
- Cart success message: auto-dismiss + tap-dismiss (§17.4)
- Notifications: backend-originated, deep-linked by `orderId`/`productId`
- Theme startup: light default before any explicit choice, saved choice restored

## 17.11 IMPLEMENTED BUT NEEDS MANUAL VERIFICATION

Passed automated and/or backend verification, but **not confirmed on a real device or visually**.
The Browser pane in this environment cannot composite frames, and Flutter web renders to canvas, so
no click-through or screenshot was possible at any point.

| # | Item | What specifically needs eyes |
|---|---|---|
| M-1 | Delivery-confirmation sheet | Pixel fidelity against the supplied reference screenshots — spacing, artwork placement, the total row |
| M-2 | Android image rendering | The whole point of the media change. Confirm product/category/avatar images actually render on a physical Android device against `10.0.2.2` or a LAN `API_BASE_URL` |
| M-3 | App-entry confirmation timing | That the sheet appears at the right moment on cold start and on resume, and never stacks |
| M-4 | Birthday prompt in-flow | That it appears right after receipt confirmation and reads correctly |
| M-5 | Rating countdown copy | That «التقييم متاح بعد ٥ ساعات» renders correctly in RTL at the real font size |
| M-6 | Cart toast timing | That 1500 ms feels right, and tap-to-dismiss is comfortable on a touch target |
| M-7 | Checkout validation UX | The new governorate error and the zones-retry notice |
| M-8 | Admin reminder card | Presets, custom date-time picker, and the locked state after sending |
| M-9 | Category card image | That the uploaded image renders and the gradient scrim keeps the title legible over a light image (§18.1) |
| M-10 | Category colour match | That the same category shows one colour across home rail, categories list and detail header (§18.2) |
| M-11 | Chip legibility | Selected «أقلام» and the community «الكل / قرطاسية» row, both themes, no clipping (§18.3, §18.4) |
| M-12 | Banner carousel | Two real banner images paging correctly, and a changed image appearing after restart (§18.5) |


## 17.12 KNOWN BUGS

Confirmed defects in current code. Each was verified by reading the named file on 2026-08-25.

| # | Pri | Bug | Evidence |
|---|---|---|---|
| B-1 | ~~P1~~ **FIXED 2026-08-25 (§20)** | ~~**`/favorites` omits every promotion field.** `favoritesRepo.shapeProductImages` returns no `previousPrice`, `discountPercent`, `hasDeliveryPromo`, `deliveryPromoAmount` or `franchiseIds`. A product showing `−40٪` on the home screen shows **no badge** in Favorites, because `Product.hasDiscount` needs those fields~~ — now maps through the canonical `catalogRepo.mapProduct` | `backend/src/repositories/favoritesRepo.ts` |
| B-2 | ~~P1~~ **FIXED 2026-08-25 (§20)** | ~~**`deliveryPromoAmount` missing from product detail and home `discover`.** `catalogService` hand-rolls two mappers that emit `hasDeliveryPromo` but not the amount, so the promo line silently disappears on those surfaces while working on `/catalog/products`~~ — both hand-rolled mappers deleted; the service now delegates to `productRepo.findDetailById` / `productRepo.listDiscover` | `backend/src/services/catalogService.ts` |
cd ~/otaku_galaxy/backend
APP_ENV=dev npm run dev| B-3 | P2 | **Inactive governorates are invisible and unrecoverable.** `adminService.listGovernorates()` calls `governorateRepo.listActive`, and `adminGovernorateSchema` has no `isActive`, so a deactivated governorate cannot be seen or restored from the admin UI | `adminService.ts:256`, `validators/admin.ts` |
| B-4 | P2 | **Admin product list omits `product_options`**, so `getProductForEdit` falls back to the public endpoint — which 404s for inactive products, making `patchProductFlags` fail on them with `INACTIVE_PRODUCT_OPTIONS_UNAVAILABLE` | `catalogRepo.ts` (no `product_options` select), `admin/src/api/productsApi.ts` |
| B-5 | P2 | **`franchises.image_url` is unreachable.** `FranchisesPage` has no image field, so the column and the `franchise` media purpose are never written | `admin/src/pages/FranchisesPage.tsx` — no `ImageUploadField` |
| B-6 | P2 | **Notification preference toggles do nothing.** 6 switches persist to `SharedPreferences`; nothing sends them to the server and no producer reads them | `lib/features/settings/data/notification_prefs_storage.dart` |
| B-7 | P2 | **Otaku level rewards are display strings.** «خصم على الطلبات» / «هدية مع الطلب» / «وصول مبكر للتشكيلات» are hardcoded in `otaku_level.dart` with no table, endpoint, admin screen, or redemption mechanism | `lib/features/points/domain/entities/otaku_level.dart` |
| B-8 | P3 | **`SearchHistoryStorage` is not cleared on logout.** `app.dart` clears 7 per-account stores but not search history, so the next account on the device sees the previous user's searches | `lib/app/view/app.dart` |
| B-9 | P3 | **Two "low stock" definitions.** `Product.lowStock` is `≤ 3` (customer) while `LOW_STOCK_THRESHOLD` is `5` (admin) | `product.dart` vs `statsRepo.ts` |
| B-10 | P3 | **`banners.title` and `destination_type` are stored but ignored** by Flutter — `Banner.fromJson` reads only `id`, `imageUrl`, `destinationValue` | `lib/features/products/domain/entities/banner.dart` |

## 17.13 KNOWN LIMITATIONS

Deliberate or accepted; not bugs.

- **No push notifications.** In-app pull only (§17.7). The app-entry confirmation check compensates
  partially.
- **Localization is 18 keys.** `AppStrings` covers nav labels and a few titles; the rest of the UI is
  hardcoded Arabic. Selecting Kurdish translates very little. The design file already contains full
  Kurdish copy.
- **Scheduler is in-process.** Correct and safe across instances via `SKIP LOCKED`, but if the API
  scales to zero (serverless) reminders stop until an instance runs.
- **Rating reminder reuses `receiptReminder`** rather than a dedicated type.
- **Community feed has no pagination** — fixed `LIMIT 60`.
- **Customer order cancellation is deliberately unwired.** `POST /orders/:id/cancel` is implemented
  and tested, but the design has no cancel affordance, so shipping one is a product decision.
- **Franchise taxonomy is admin-only.** `Product.franchiseIds` is parsed by Flutter and never
  rendered; there is no "browse by anime" screen.
- **No media garbage collection.** Replacing a product image or clearing an avatar orphans the file
  and its `media_files` row permanently.
- **Business constants are in source**, not settings: `POINTS_AWARDS` (20/1/5),
  `BIRTHDAY_DISCOUNT_PERCENT` (5), `LOW_STOCK_THRESHOLD` (5), level thresholds, ETA presets, home
  promo copy, search suggestion chips.
- **`config.publicBaseUrl` is now dead.** After the media change nothing reads it; the env var and
  `.env.example` entry are vestigial.
- **`otpService` ignores two documented env vars** — it defines its own `CODE_TTL_MS` and
  `MAX_ATTEMPTS` and never reads `config.verification.lifetimeMinutes` / `maxAttempts`.

## 17.14 PRODUCTION BLOCKERS

Re-verified against the code on 2026-08-25. **The two P0 items from the original audit are still
present and unchanged.**

| # | Pri | Issue | Status | Evidence |
|---|---|---|---|---|
| S-1 | **P0** | **Fixed OTP `123456`.** `VERIFICATION_PROVIDER` defaults to `development` and `.env.example` ships that value; in that mode every code is `DEVELOPMENT_OTP_CODE` (`123456`). No SMS provider exists and there is **no startup guard** for production. Deployed as-is, `forgot-password` + `123456` is a full account takeover for any phone number | **STILL PRESENT** | `config/index.ts:23,26`; `otpService.ts:33,45`; no `NODE_ENV === 'production'` check anywhere in `backend/src` |
| S-2 | **P0** | **Insecure default secrets.** `jwtSecret` falls back to `'insecure_dev_secret_change_me'`; `DATABASE_URL` falls back to a hardcoded credential; startup does not fail when they are unset. `seed.ts` creates admin `07700000000 / admin123` and prints it | **STILL PRESENT** | `config/index.ts:18,12,15`; `seed.ts:170,180` |
| S-4 | P1 | **`avatarUrl` accepts any external origin.** Now also accepts `/uploads/…`, but an absolute URL on any host is still stored without checking it came from `POST /uploads` | **STILL PRESENT** | `validators/auth.ts:50` |
| S-5 | P1 | **`products.rating` / `review_count` are API-writable.** `adminProductUpdateSchema` accepts both, letting an admin publish a rating no customer produced — which the review trigger then silently overwrites. The form disables the inputs; the API does not | **STILL PRESENT** | `validators/admin.ts:80-81` |
| S-6 | P2 | **Uploads have only the global rate limit.** 300 req/15 min/IP, 5 MB each, no per-user quota, no storage cap, no cleanup | **STILL PRESENT** | `app.ts`, `middleware/upload.ts` |
| S-7 | P2 | **Rate limiting is IP-only.** No per-phone throttle on `register`/`forgot-password`/`resend-code`, and `app.set('trust proxy')` is never configured | **STILL PRESENT** | `middleware/error-handler.ts` |
| S-8 | P1 | **No token revocation.** 7-day JWTs, no denylist, no `jti`, no `token_version`. Suspending a user blocks login and `/auth/me` but every other authenticated route keeps working until expiry. Same for password change | **STILL PRESENT** | `middleware/auth.ts`; grep for `token_version`/`jti` returns nothing |
| S-9 | P3 | **User enumeration.** `forgot-password` and `resend-code` return `409 «هذا الرقم غير مسجّل»` for unknown numbers while `login` is generic | **STILL PRESENT** | `authService.ts:57,73` |
| S-3 | — | Review `photoUrl` accepted arbitrary strings shown to every user | **FIXED** | `reviewsService.assertOwnedPhoto` + 2 tests |

**Deployment gate: S-1 and S-2 must be resolved before any production deployment.** Nothing else in
this document changes that.

## 17.15 OTHER AUDIT FINDINGS

**Orphaned endpoints (implemented, reachable, nobody calls them):**
`POST /api/orders/:id/cancel` (tested) · `GET /api/catalog/franchises` ·
`POST /api/admin/notifications` · `GET /api/admin/products/:id/franchises` (wrapper exists, no page)
· `GET /api/admin/governorates/:governorateId/zones`.
*No longer orphaned:* the community `?categoryId=` parameter — Flutter now sends it.

**Dead code:** `ApiClient.put()` · `admin/src/api/productsApi.ts#fetchAllProducts` ·
`admin/src/api/communityApi.ts#productFranchises` · `pointsService.awardOrderReceived` / `.balance` /
`.activity` · `reviewsService.countPending` · `orderRepo.findByNumber` ·
`favoritesService.isFavorite` · `cartService.clear` · the `product_discount_percent()` SQL function ·
`config.publicBaseUrl`.
*No longer dead:* `mediaRepo.findByUrl` — now backs the photo-ownership check.

**TODO/FIXME/HACK/XXX:** none in `lib/`, `backend/src/` or `admin/src/`. The only `XXX` match is the
placeholder text `07XXXXXXXXX` in the admin login field.

**Swallowed errors:** 26 `catch (_)` / bare-catch sites remain. Most are deliberate and commented
(cache refreshes, optional loads). The ones that still hide real failure from the user:
`CartCubit.load()`/`_sync()` — a failed cart load is indistinguishable from an empty cart;
`BirthdayStorage.refresh()` and `StoreSettingsRepository.refresh()` silently serve stale data.
*Fixed this batch:* `order_review_screen`, `write_review_screen` and `order_data_screen._loadZones`
now surface real causes.

**Hardcoded hosts:** confined to `app_config.dart` (documented per-platform dev defaults, overridable
via `--dart-define=API_BASE_URL`), `admin/src/api/client.ts` (`VITE_API_BASE_URL` fallback) and
`config/index.ts` (dev fallbacks — part of S-2). No hardcoded host in any feature code.

**Duplicated logic:** two media resolvers (Flutter + admin) — **intentional**, one per consumer
applying the same rule; the order-status transition map exists in both server and admin (server is
authoritative, admin only renders buttons); the discount-percent formula is written four times
(`catalogRepo`, `catalogService` ×2, and the unused SQL function).

**Missing states:** covered well overall (`AnimeEmptyState`, `AnimeErrorState`, `OtakuSkeleton`,
`OfflineGate`). Remaining gaps are the swallowed-error sites above.

**Tests:** `admin/` has **no test runner and zero tests**. `test/api_integration_test.dart` is not
hermetic (T-1). Rate limiting is never exercised (`skip: () => isTest`).

## 17.16 RECOMMENDED NEXT STEPS

Ordered by what actually blocks value.

**Before any production deployment**
1. **S-1** — implement a real SMS provider behind `config.verification.provider`, add per-phone
   throttling, and fail startup if production is configured with `development`.
2. **S-2** — fail startup when `JWT_SECRET` / `DATABASE_URL` are unset; remove the seeded admin
   password from `seed.ts` output.

**High value, small effort (each is a contained fix with an obvious test)**
3. ~~**B-1 / B-2** — reuse `catalogRepo.mapProduct` in `favoriteRepo.list` and in the two
   `catalogService` mappers.~~ **DONE 2026-08-25 (§20)** — all three duplicate mappers deleted; the
   discount formula now exists in exactly one place.
4. **S-5** — drop `rating` / `reviewCount` from `adminProductUpdateSchema`; the trigger is the only
   legitimate writer.
5. **S-8** — add `users.token_version` to the JWT and check it in `authenticate`, so suspension and
   password change actually invalidate sessions.
6. **T-1** — make `api_integration_test.dart` hermetic (seed its own fixtures, or drop the
   "every subcategory has products" invariant). This is the only failing test in the project.

**Then**
7. **M-1…M-8** — one manual device pass to close out §17.11, especially **M-2** (Android image
   rendering), which is the payoff of the media change.
8. **B-3 / B-4 / B-5** — admin lifecycle gaps: governorate activate/deactivate, product options in
   the admin list, franchise image upload.
9. Stand up a test runner for `admin/` — it currently has zero coverage while holding real financial
   display logic.
10. Move business constants into `store_settings` (points, birthday percent, low-stock threshold) and
    give the admin a screen for them.

**Product decisions still owed** (blocking work that is otherwise ready)
- What an Otaku level reward actually grants (B-7).
- Whether customer-initiated order cancellation should ship — the endpoint is built and tested.
- Whether franchise browsing ships or the taxonomy is removed.
- Whether notification preferences should be real (B-6) — note that "points" and "birthday" toggles
  currently correspond to notifications that are never produced.


---

# STEP 18 — CATEGORY IMAGES · CATEGORY COLOUR · CHIP CLIPPING · BANNERS · RATING ANCHOR

**2026-08-25.** Six reported defects. Each root cause below was found by reading the code and, where
possible, reproduced against the live server before any change.

## 18.1 Main category images — `FIXED`

**Root cause: the card never read the field.** `AnimeCategoryCard` built a gradient plus a giant
watermark of the category's first letter (`category.name.trim().characters.first`) and **never
referenced `category.imageUrl` at all**. The admin could upload an image, the backend persisted it,
the API returned it, `Category.fromJson` resolved it — and the widget discarded it. So the reported
«ق» was not a fallback for a missing image; it was the only thing the card could ever draw.

**Fix.** The card now renders `Image.network(category.imageUrl)` filling the card, under a gradient
scrim derived from the category's own palette so the title stays legible over any image. The letter
watermark is kept **only** when there is no image, and a failed load falls back to it rather than
showing a broken-image box. No image URL is hardcoded; the value comes from the model, already
resolved by `resolveMediaUrl`.

**Also fixed: the upload purpose.** `CategoriesPage` uploaded with `purpose="banner"` because
`media_files.purpose` had no category value, so category images were filed under `uploads/banner/`
and mislabelled in the media table. Migration `023` adds `'category'` and relabels the rows that can
be attributed to a category with certainty. Existing files are **not** moved on disk — the storage
key is part of the URL already saved in `categories.image_url`, and moving them would break working
images.

**Verified live:** upload (`purpose=category`) → `/uploads/category/2026/08/…` → saved on «قرطاسية» →
survives admin reload → same value from `GET /catalog/categories` → file serves `200`.

## 18.2 Category detail header colour — `FIXED`

**Root cause: the colour was derived from list position.** `gradientFor(index)` indexes a
five-gradient palette by the category's position in whatever list the screen happens to hold.
`category_products_screen` recovered that index by re-fetching all categories and calling
`indexWhere` — inside a `try/catch (_)` that silently left `_categoryIndex = 0` on any failure, and
which only ran *after* the header had already painted with index 0.

That makes the colour unstable by construction: it changes when the admin adds, reorders or
deactivates a category, and differs between any two screens showing different subsets.

**Fix.** New `AnimeCategoryCard.gradientForCategory(Category)` derives the palette from a stable sum
over `category.id` rather than list position. The card, the home rail and the detail header now all
call it, so the colour is identical everywhere and correct on first paint — no cross-screen
coordination and no backend field required. `gradientFor(index)` is kept for compatibility with a
comment explaining why it should not be used.

**No new colours were introduced** — the same five design-source gradients are used.

## 18.3 Inner category selected state — `FIXED`

**Root cause: vertical clipping, plus a transparent fill.** `_buildSubcategoryPills` wrapped a
horizontal `ListView` in `SizedBox(height: 52)` with `padding: fromLTRB(18, 14, 18, 4)` — leaving
**34 px** for a chip that needs ~35 (9 + 9 padding around a ~17 px line). The capsule and the text
inside it were cut. Separately, `AnimeChoiceChip` set `color: Colors.transparent` for the selected
state, relying entirely on the gradient to paint it — so a clipped or unpainted gradient read as a
pale, translucent shape.

**Fix.** The fixed height is gone: the row is now a `SingleChildScrollView` + `Row` that measures its
own content, so it grows with text scaling and cannot clip. The selected chip keeps its
`primaryGradient` but now sits on a solid `AppColors.secondary` fill instead of `transparent`, so it
is opaque in every case. Existing tokens only — no new colours.

## 18.4 Community filter row clipped — `FIXED`

**Root cause: the same class of bug, worse.** `SizedBox(height: 54)` with
`padding: fromLTRB(18, 16, 18, 8)` left **30 px** for the same ~35 px chip, which is why roughly half
of each label was missing. Not a font, overflow or RTL problem.

**Fix.** Same treatment — content-measured horizontal scroll, no fixed height. Verified at 320 / 390
/ 430 px widths in both themes.

## 18.5 Banners — `FIXED`

**Root cause: the banner data was thrown away.** `BannerCarousel` used `widget.banners` only for the
page count and the dots. Each page rendered `_PromoSlide(index: index)`, which built from a
**hardcoded list of three promo tuples** inside the file and never touched
`widget.banners[index].imageUrl`. The admin's image was uploaded, stored, returned by the API and
parsed by Flutter — and then discarded by the widget. Nothing was wrong with the media pipeline.

**Fix.** `_PromoSlide` now takes the `Banner` and renders its image. The previous promotional design
survives as `_PromoFallback`, shown when a banner has no image or its image fails to load, and an
`OtakuSkeleton` covers loading.

**Cache:** no cache-busting strings were added and none are needed. Every upload gets a fresh UUID
filename, so changing a banner produces a *different* URL and Flutter's image cache cannot serve the
old one.

**Verified live with two images:** banner set to image 1 → public API returns image 1 → changed to
image 2 → public API returns image 2 → image 2 serves `200`; `/catalog/home` returns both banners.

## 18.6 Rating window anchored to dispatch, not to the customer's tap — `FIXED`

**Root cause, reproduced against real data.** `markDelivered` ran on the transition into `COMPLETED`
and set `rating_available_at = now() + delay`. In the customer path, `COMPLETED` **is** the moment
the customer taps «نعم، استلمت الطلب» — so the 24-hour clock started from their tap. A query over
recent orders showed it plainly:

```
order | dispatch→complete | complete→ratingAvailable | confirmed by
#69   | 0.2 min           | 24.00 h                  | CUSTOMER
#68   | 0.5 min           | 24.00 h                  | CUSTOMER
#63   | 1.7 min           | 24.00 h                  | CUSTOMER
```

`rating_available_at − delivered_at` was always exactly the configured delay, and `delivered_at` was
always the customer's tap. That is precisely the behaviour that must never happen.

**Fix: move the anchor to the admin's action.** `markDispatched` now sets `dispatched_at` **and**
`rating_available_at` when the order enters `OUT_FOR_DELIVERY`, guarded by `dispatched_at IS NULL`
so re-applying the status cannot move it. `markDelivered` still stamps `delivered_at` on
confirmation but uses `COALESCE(rating_available_at, …)` — it can only fill a window that does not
exist yet (legacy rows), never move one.

This matches the stated rule exactly: dispatched 10:00 with a 24 h rule → window opens 10:00 next
day, whether the customer confirms at 10:30 or never.

**Schema (migration `022`).** `orders_rating_window_pair` and `orders_rating_after_delivery` both
encoded the old assumption — that the window cannot exist before confirmation, and cannot precede it.
Both are dropped and replaced by `orders_rating_after_dispatch`. `dispatched_at` is backfilled from
`order_status_history`, and orders whose reminder has **not** yet been sent are re-anchored so
existing customers benefit; orders already reminded are left alone because the notification has gone.

**Verified against the real services** (`config.orders.ratingDelayHours` varied per scenario):

| Scenario | Rule | Confirmed | window − dispatch | window − confirm | ratingAvailable |
|---|---|---|---|---|---|
| A | 24 h | 0.5 h after dispatch | **24.00 h** | 23.50 h | `false` (correctly locked) |
| B | 24 h | 25 h after dispatch | **24.00 h** | −1.00 h | `true` (immediately) |
| E | 0 h | 1.5 h after dispatch | **0.00 h** | −1.50 h | `true` (immediately) |

`window − dispatch` always equals the rule; `window − confirm` never does. The tap does not move the
clock.

## 18.7 Admin delivery timing (investigation result)

The Admin Dashboard was **not** at fault — it updates status through the same transactional path and
the timestamps were being written correctly. The defect was purely which transition owned the
anchor. Nothing was stale, null, or cached.

Admin now also *shows* the anchor: the order page displays «خروج الطلب للتوصيل» alongside
«تأكيد الاستلام», the reminder presets read «بعد الخروج للتوصيل بـ», and the reminder card appears as
soon as the order is dispatched rather than waiting for confirmation
(`ORDER_NOT_DISPATCHED` replaces `ORDER_NOT_DELIVERED`).

## 18.8 One source of truth (audit)

Searched the whole codebase for duplicated delay logic:

- **`Duration(hours: …)` in `lib/`: none.** No client-side delay arithmetic exists.
- The only rating `24` is `config.orders.ratingDelayHours` (env `ORDER_RATING_DELAY_HOURS`) — the
  legitimate business configuration.
- `24` matches in `admin/src` are antd grid columns, not time.
- Backend gate: `rating_available_at IS NOT NULL AND rating_available_at <= now()` in
  `orderRepo`'s order projection.
- Scheduler: `rating_available_at <= now()` in `ratingReminderJob`.
- Flutter: consumes the server's `ratingAvailable` boolean and renders remaining time from
  `ratingAvailableAt`.

All three read the same persisted column. Disagreement is structurally impossible.

## 18.9 Files changed

- **Backend:** `migrations/022_rating_window_anchored_to_dispatch.sql` (new),
  `migrations/023_media_category_purpose.sql` (new), `repositories/orderRepo.ts`
  (`markDispatched`, `dispatchedAt`, reschedule guard), `services/orderService.ts`,
  `types/index.ts`.
- **Flutter:** `core/design_system/components/cards/anime_category_card.dart`,
  `core/design_system/components/inputs/anime_choice_chip.dart`,
  `features/categories/presentation/screens/category_products_screen.dart`,
  `features/community/presentation/screens/community_screen.dart`,
  `features/home/presentation/widgets/banner_carousel.dart`.
- **Admin:** `types/orders.ts`, `pages/OrderDetailPage.tsx`, `pages/CategoriesPage.tsx`,
  `api/uploadsApi.ts`.
- **Tests:** `tests/order-rating-lifecycle.test.ts` (+6 anchor tests), `tests/helpers.ts`
  (`fastForwardRatingWindow` now shifts all three stamps), `test/category_and_chips_test.dart`
  (new, 9 tests).

## 18.10 API changes

Additive only. Order payloads now include `dispatchedAt`. Upload `purpose` accepts `category`.
New error code `ORDER_NOT_DISPATCHED` replaces `ORDER_NOT_DELIVERED` on the reminder endpoints.
No endpoint added, removed or renamed.

## 18.11 Verification

Backend `npm test` — **115 passing** (was 109; +6 anchor tests).
`flutter analyze` — clean. `flutter test` — **275 passing, 1 pre-existing failure**
(`api_integration_test.dart`, §17.1). Admin `tsc --noEmit` and `npm run build` — clean.
Migrations `022` and `023` applied to the dev database.

## 18.12 Remaining limitations for this batch

- **No visual/on-device confirmation.** All six fixes are verified through the API, the database, the
  real services and widget tests. The Browser pane cannot composite frames here and Flutter web
  renders to canvas, so nothing was seen rendered. Items needing eyes: category image on the card and
  its scrim contrast, header colour match across the three screens, chip legibility in both themes,
  the banner carousel with two real images, and the rating countdown copy. These are added to
  §17.11's manual-verification list.
- **Category colour is still client-derived.** It is now stable and consistent, but the admin cannot
  *choose* a category's colour. If that becomes a requirement it needs a `categories.color` column —
  deliberately not added here, since nothing in the current product asks for it.
- `_categoryIndex` was removed from `category_products_screen`; the screen now keeps the resolved
  `Category` instead, which also gives it access to the category image if a future header wants it.

---

*End of PROJECT_FEATURE_SPEC.md — audit sections above are audit-only; see the implementation log
for post-audit changes.*

---

# STEP 19 — AUTHENTICATION & PRODUCTION SECURITY HARDENING
*2026-08-25 · registration/login root cause · real OTP architecture · SMS boundary · S-2 · S-4 · S-8*

## 19.0 Why new accounts could not register or log in

Three independent defects stacked on the same journey. All three were reproduced against the real
server over HTTP before anything was changed.

**(a) One rate-limit bucket for six endpoints — the primary cause.**
`routes/auth.ts` created a *single* `authRateLimiter()` instance (`RATE_LIMIT_AUTH_MAX=10`, 15 min,
keyed by IP) and shared it across `register`, `verify`, `resend-code`, `login`, `forgot-password`
and `reset-password`. Observed: after **7** registrations from one address, every auth endpoint —
including `login` — returned `429` for 15 minutes. One honest signup costs 2–5 requests, so a
single user with a mistyped code plus one resend consumed half the bucket. Worse, `app.ts` never
set `trust proxy`, so behind nginx or carrier-grade NAT (the normal case on Iraqi mobile networks)
**every user in the country shared one bucket of ten**.

**(b) The account row was created before verification, and the number was then locked.**
`authService.register` inserted the user, then any retry hit
`409 هذا الرقم مسجّل بالفعل`. A user whose SMS was slow, who mistyped, or who closed the app was
permanently unable to finish signing up on that number.

**(c) There was no verification state at all.**
`users` had no verified column. OTP verification wrote nothing durable, and
`authService.login` never consulted it — so an unverified account logged in normally and the OTP
step was decorative. "The account becomes verified only after successful verification" was
unimplemented.

### Fixes
| Cause | Fix |
|---|---|
| (a) shared bucket | Per-purpose limiters; sensitive ones keyed **per (phone + IP)**; `trust proxy` configurable |
| (b) locked number | Unverified rows are *pending registrations* — re-registering resumes them |
| (c) no state | `users.phone_verified_at`; set only by `verifyRegistration`; enforced by `login` |

### Verified end-to-end on the running server (not mocks, not tests)
```
register (new phone)                 → 200, isPhoneVerified:false
login before verifying               → 403 PHONE_NOT_VERIFIED
verify with wrong code               → 400 OTP_INVALID
verify with correct code             → 200, isPhoneVerified:true, token issued
verify again (reuse)                 → 400 OTP_INVALID
login after verifying                → 200
login with wrong password            → 401 (same message as unknown phone)
/auth/me, /cart, /orders with token  → 200, 200, 200
25 registrations from one IP         → 18×200 then 429 (OTP-send bucket only)
   …login during that 429            → 200  ← previously 429, this was the bug
```

## 19.1 Rate limiting

`middleware/error-handler.ts` now exposes four limiters instead of one.

| Limiter | Key | Default | Guards |
|---|---|---|---|
| `authRateLimiter` | IP | 60 / 15 min | flooding only — deliberately wide |
| `loginRateLimiter` | **phone + IP** | 10 / 15 min | password guessing |
| `otpVerifyRateLimiter` | **phone + IP** | 10 / 15 min | code guessing (above the per-code ceiling) |
| `otpSendRateLimiter` | IP | 20 / 15 min | SMS cost / flooding |

IPv6 keys go through `ipKeyGenerator` so a /64 cannot be used to multiply the budget. The
per-**phone** resend ceiling lives in `otpService` and is backed by the database, because it must
survive restarts and hold across multiple server instances behind a load balancer.

`TRUST_PROXY` (default `1` in production, `false` in development) must match the real number of
proxy hops or every client collapses into one bucket again.

## 19.2 OTP lifecycle

```
send   → assertSendAllowed (per-phone cooldown + window ceiling, from DB)
       → consumeAllActive (only one live code per phone+purpose)
       → crypto.randomInt(0, 1_000_000), zero-padded to 6   [or the dev code, if explicitly enabled]
       → store bcrypt hash + expires_at
       → SmsProvider.send                                   [or console, in development only]
verify → latestActive → expired? → attempts exhausted?
       → increment attempts BEFORE comparing (a crash cannot buy free attempts)
       → bcrypt.compare → consume on success, and consume on the final failed attempt
```

| Property | Value | Source |
|---|---|---|
| Code space | 6 digits, CSPRNG (`crypto.randomInt`) | `otpService.generateCode` |
| Lifetime | 10 min | `VERIFICATION_CODE_LIFETIME_MINUTES` |
| Attempts per code | 5 | `VERIFICATION_MAX_ATTEMPTS` |
| Resend cooldown | 60 s | `VERIFICATION_RESEND_COOLDOWN_SECONDS` |
| Resend ceiling | 5 per 15 min | `VERIFICATION_MAX_SENDS_PER_WINDOW` / `..._WINDOW_MINUTES` |
| Storage | bcrypt hash only — never plaintext | `verification_codes.code_hash` |
| In API responses | never | — |
| In logs | development only, and only when `DEV_OTP_ENABLED=true` | `otpService` |

Single-use is enforced by `consumed_at`: success consumes, expiry consumes, exhausting attempts
consumes. `latestActive` filters on `consumed_at IS NULL`, so a consumed code cannot be replayed.

### Development vs production OTP
`DEV_OTP_ENABLED=true` is the **only** way to enable the fixed `123456`, and it is impossible in
production: `NODE_ENV=production` + `DEV_OTP_ENABLED=true` **refuses to boot**. Absence of
`NODE_ENV` does *not* enable it — the previous design turned it on by default, so any deployment
that forgot `NODE_ENV` accepted `123456` for every account.

The Flutter "رمز التجربة" hint follows the same rule: shown only in a **debug build** of the
**development** environment, and suppressible with `--dart-define=SHOW_DEV_OTP_HINT=false`. A
release build never hints that a fixed code exists.

## 19.3 SMS provider boundary — **ready, not connected**

`backend/src/services/sms/index.ts` defines `SmsProvider { name, send({to, message}) }`. The
authentication system knows only this interface; no vendor name appears anywhere else.

| `SMS_PROVIDER` | Behaviour | Production |
|---|---|---|
| `console` | prints to terminal | **refused at boot** |
| `noop` | sends nothing (tests) | **refused at boot** |
| `http` | generic JSON `POST`, fully env-configured | supported |

`http` sends `POST {SMS_BASE_URL}` with `Authorization: Bearer {SMS_API_KEY}`, optional
`X-Api-Secret`, body `{ to, message, sender }`, and an `AbortController` timeout. Non-2xx and
network failures raise `SmsDeliveryError` — never a silent success.

**Verified:** the provider is built from config, issues a real HTTP request with the documented
headers and body, and surfaces a 502 as an error (`sms-http-roundtrip.ts` fixture, two tests).
**Not verified:** delivery through an actual carrier. **No real SMS has been sent.**

Still required before real SMS works:
1. A carrier/aggregator account and a registered sender ID.
2. `SMS_PROVIDER=http`, `SMS_BASE_URL`, `SMS_API_KEY`, `SMS_API_SECRET` (if used), `SMS_SENDER`.
3. Confirm the vendor accepts the `{to, message, sender}` JSON shape and Bearer auth. If it differs
   (form encoding, query auth, XML), add a class in `sms/index.ts` and register it in
   `createSmsProvider` — nothing outside that file changes.
4. Confirm the accepted phone format (the app stores local `07XXXXXXXXX`; many vendors want E.164
   `+9647XXXXXXXX` — the conversion belongs in the provider class).
5. Delivery-failure policy: `register` currently propagates a send failure to the caller.

## 19.4 JWT — S-2 `FIXED`

`insecure_dev_secret_change_me` is gone. `config/index.ts` collects every configuration fault and
throws once at import, so the server **fails fast at startup** rather than serving traffic with a
guessable signing key.

In production `JWT_SECRET` must exist, be ≥ 32 characters, and not be a known placeholder
(`insecure_dev_secret_change_me`, `change_me_generate_a_long_random_hex_string`, `secret`,
`changeme`). Development falls back to `development_only_jwt_secret_do_not_use_in_production` —
named so it can never be mistaken for, or silently promoted to, a production secret.

Tokens carry `{ sub, role, phone, tv }` and expire per `JWT_EXPIRES_IN` (was hardcoded `7d`,
ignoring the setting). Existing sessions were **not** invalidated: tokens without `tv` are treated
as version `0`, which is the column default.

## 19.5 DATABASE_URL `FIXED`

Production requires `DATABASE_URL`; it is parsed and rejected unless it is a `postgres://` URL with
a host and a database name. Development and test keep their local defaults. Previously a production
box with no `DATABASE_URL` silently connected to a hardcoded localhost URL with a hardcoded
password.

## 19.6 Admin seed `FIXED`

`admin123` is removed. `scripts/seed.ts` creates an admin **only** when both `SEED_ADMIN_PHONE` and
`SEED_ADMIN_PASSWORD` are set; the password must be ≥ 12 characters and **is never printed** (the
old code logged `Admin user: 07700000000 / admin123` into every deploy log). Seeding a production
database additionally requires `ALLOW_PRODUCTION_SEED=true`.

Test code uses its own local constant in `tests/helpers.ts` — a test fixture, not a product default.

## 19.7 Token revocation — S-8 `FIXED`

**The problem:** `authenticate` verified the signature and nothing else. Suspending an account
stopped new logins but left every already-issued token working on every protected route for up to
seven days. Only `/auth/me` rejected it, and only because it happened to read the database.

**The mechanism** (smallest change that fits the existing stateless-JWT design):
- `users.token_version INTEGER NOT NULL DEFAULT 0`; tokens carry it as `tv`.
- `authenticate` performs one primary-key lookup (`findAuthState`: `is_active`, `token_version`,
  `role`, `phone`) and rejects on `is_active = false` (`403 ACCOUNT_SUSPENDED`) or on
  `tv ≠ token_version` (`401 SESSION_REVOKED`).
- `role` and `phone` are read from the row, not the token, so a role change applies immediately.

`token_version` is incremented on suspension, password reset, password change, and when a pending
registration is overwritten. Password change returns a fresh token so the acting device stays
signed in while its other sessions drop.

Both clients now end the session on `401` **or** on `403 ACCOUNT_SUSPENDED`, and *only* that 403 —
a permission-denied 403 or `PHONE_NOT_VERIFIED` must not log anyone out
(`api_client.dart#_endsSession`, `admin/src/api/client.ts`).

Cost: one indexed lookup per authenticated request. Accepted deliberately — without it, "suspend"
does not suspend.

## 19.8 avatarUrl — S-4 `FIXED`

Previously `updateProfileSchema` accepted any `https://…`, so a user could store an origin they
control and have it fetched by every viewer of their profile — leaking viewer IPs and user-agents,
with content swappable after saving.

Now the value must be a relative `/uploads/…` reference **and** resolve to a row in `media_files`
(`authService.assertOwnedAvatar`), mirroring `reviewsService.assertOwnedPhoto`. `null` still clears
the avatar. The relative-URL representation from the media batch is preserved — nothing external is
accepted, and no absolute origin is stored.

## 19.9 Database changes — `024_auth_hardening.sql`

| Change | Note |
|---|---|
| `users.phone_verified_at TIMESTAMPTZ` | verification state |
| backfill `= created_at` for existing rows | existing users keep working; the gate applies onward |
| `users.token_version INTEGER NOT NULL DEFAULT 0` | revocation |
| `idx_verification_codes_phone_created` | serves the resend-window count |

Additive only. No column or table was dropped or renamed.

## 19.10 API changes

| Endpoint | Change |
|---|---|
| `POST /auth/register` | resumes unverified registrations; `409 PHONE_TAKEN` only for verified |
| `POST /auth/login` | `403 PHONE_NOT_VERIFIED` (+ resend) for unverified; `403 ACCOUNT_SUSPENDED` |
| `POST /auth/verify` | sets `phone_verified_at`; typed codes `OTP_INVALID` / `OTP_EXPIRED` / `OTP_ATTEMPTS_EXCEEDED` |
| `POST /auth/resend-code` | uniform response whether or not the number exists; `429 OTP_RESEND_COOLDOWN` / `OTP_RESEND_LIMIT` |
| `POST /auth/forgot-password` | uniform response whether or not the number exists |
| `PATCH /auth/me` | `400 INVALID_AVATAR_URL` for non-owned references |
| `PATCH /auth/me/password` | now returns `{ token, user }` (other sessions are revoked) |
| all protected routes | `403 ACCOUNT_SUSPENDED` / `401 SESSION_REVOKED` |
| `PublicUser` | gains `isPhoneVerified: boolean` |

**Breaking for clients:** `PATCH /auth/me/password` returns a body where it returned `null`. The
Flutter client ignores it, so nothing breaks today, but a client that stores the old token will
start getting `401 SESSION_REVOKED` — it should adopt the returned token.

## 19.11 Required production environment

```bash
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>        # ≥32 chars, not a placeholder — boot fails otherwise
DATABASE_URL=postgres://user:pass@host:5432/db   # boot fails if missing/invalid
TRUST_PROXY=1                            # MUST match the real proxy hop count
SMS_PROVIDER=http
SMS_BASE_URL=https://<vendor>/send
SMS_API_KEY=<key>
SMS_API_SECRET=<secret, if the vendor uses one>
SMS_SENDER=<registered sender id>
# DEV_OTP_ENABLED must be absent or false — true refuses to boot in production
```
Optional: `VERIFICATION_*` (code lifetime/attempts/resend), `RATE_LIMIT_*`, `JWT_EXPIRES_IN`,
`SEED_ADMIN_PHONE`/`SEED_ADMIN_PASSWORD` (+ `ALLOW_PRODUCTION_SEED=true`).

## 19.12 Tests

`backend/tests/auth-security.test.ts` — 40 tests: full new-account journey, verification gate,
resumable abandoned registration, no-duplicate-users, credential rejection without enumeration,
invalid/expired/reused OTP, attempt ceiling, resend cooldown and window ceiling, non-enumerating
resend and forgot-password, code randomness, JWT_SECRET (missing / placeholder / too short / valid),
DATABASE_URL (missing / invalid / valid), dev-OTP behaviour in development / production / with
`NODE_ENV` absent, SMS provider construction and a real HTTP round-trip plus failure surfacing,
suspension revocation across `/auth/me` `/cart` `/orders`, unaffected bystanders, reactivation,
password-change revocation, avatar validation (external / unowned / owned / clear), and seed safety.

Config-dependent cases run in child processes with `DOTENV_CONFIG_PATH` pointed at an empty file —
otherwise `dotenv` reloads the developer's `.env` and "the secret is missing" tests silently pass
with the secret present, testing nothing.

`test/auth_revocation_contract_test.dart` — 4 tests: `403 ACCOUNT_SUSPENDED` and `401` end the
session; permission-denied `403` and `PHONE_NOT_VERIFIED` do not.

| Suite | Result |
|---|---|
| Backend `npx vitest run` | **155 passed** (115 pre-existing + 40 new) |
| Flutter `flutter test` | **279 passed, 1 failed** — pre-existing catalog data gap, see below |
| `flutter analyze` | clean |
| Admin `npm run build` (`tsc -b` + vite) | clean |

## 19.13 Known issues and limitations

1. **`api_integration_test.dart` "أقسام الإكسسوارات والحقائب" fails — pre-existing, unrelated.**
   It asserts every subcategory of «إكسسوارات» has products; the dev database has **0** products in
   «ميداليات» (and in «قلائد», «أساور», «إكسسوارات أخرى», «ساعة يد / ساعة جيب»). A catalog-content
   gap, not an auth defect; left alone as out of scope for this batch.
2. **No real SMS has been sent.** See §19.3.
3. **Phone-number format for the vendor.** Codes are sent to the stored local format; E.164
   conversion, if required, belongs in the provider class.
4. **Rate-limit state is per-process** (`express-rate-limit` memory store). With several instances
   the effective ceiling multiplies by instance count. The per-phone OTP ceilings are DB-backed and
   unaffected; move the HTTP limiters to a shared store if the API is scaled horizontally.
5. **Suspension costs one DB lookup per authenticated request.** Deliberate; add a short-TTL cache
   only if profiling shows it matters.
6. **`register` surfaces SMS delivery failure to the user.** Reasonable while the provider is
   synchronous; revisit if the vendor is flaky.

---

# STEP 20 — PRODUCT MAPPER CONSOLIDATION (B-1 / B-2)
*2026-08-25 · one canonical product representation across every surface*

## 20.0 Root cause

**Five different functions built "a product", each forgetting different fields.**

The product contract was never defined in one place. Every surface that needed to return a product
wrote its own object literal, and each author included whatever that screen happened to need at the
time. The result was a product that was discounted on one screen and full-price on another.

| # | Mapper | Location | Fields dropped |
|---|---|---|---|
| 1 | `mapProduct` | `catalogRepo.ts` | — complete — |
| 2 | discover mapper | `catalogService.getHome` (inline) | `deliveryPromoAmount`, `isActive` |
| 3 | detail mapper | `catalogService.productDetail` (inline) | `deliveryPromoAmount`, `isActive` |
| 4 | `shapeProductImages` | `favoritesRepo.ts` | `previousPrice`, `discountPercent`, `hasDeliveryPromo`, `deliveryPromoAmount`, `isActive`, `franchiseIds` |
| 5 | `CartItem.fromJson` | `lib/features/cart/.../cart_item.dart` | **dead code** — read `json['product']`, a key the API has never sent |

Mappers 1–3 each carried **their own copy of the discount formula**
(`Math.round(((previousPrice - price) / previousPrice) * 100)`) — three chances to drift.

**Why it was invisible.** Nothing ever threw. `Product.fromJson` in Flutter reads a missing field as
`null` / `0`, and the card deliberately hides the delivery-promo line when the amount is `0`
(`_deliveryPromoLabel` returns `null` unless `amount > 0`). So a dropped field did not produce an
error, a warning, or a log line — it produced a silently missing badge on one screen.

### Reproduced before the fix (same product, real API, real HTTP)

```
SURFACE           prevPrice  disc%  hasPromo  promoAmt
catalog list          20000     25      True      2500
product detail        20000     25      True   MISSING   ← B-2
home offers           20000     25      True      2500
home selected         20000     25      True      2500
home discover         20000     25      True   MISSING   ← B-2
search                20000     25      True      2500
favorites           MISSING MISSING   MISSING   MISSING   ← B-1
```

## 20.1 Canonical mapper

**`catalogRepo.mapProduct` is the single source of truth**, chosen because it was already the only
complete one and already served the highest-traffic paths (`/catalog/products`, search, offers,
selected, and every admin product route). Adopting it changed *no* response that was already
correct — the four working surfaces were byte-identical before and after.

It is now exported alongside the SQL fragments the mapping depends on:

| Export | Purpose |
|---|---|
| `mapProduct(row)` | the only product representation; derives `discountPercent` from the two prices |
| `PRODUCT_RELATION_COLUMNS(prefix)` | the `images` + `franchise_ids` subqueries `mapProduct` requires |
| `SELECT_WITH_IMAGES(prefix)` | full product `SELECT` built on the above |

Two repository methods absorbed the SQL that previously lived in the service layer, so that query
and mapping stay together:

- `productRepo.listDiscover(db, seed, limit)` — the stable-random "discover" list.
- `productRepo.findDetailById(db, id)` — `mapProduct` plus `options`, the one legitimate difference
  between detail and list.

## 20.2 Files modified

| File | Change |
|---|---|
| `backend/src/repositories/catalogRepo.ts` | exported `mapProduct`, `PRODUCT_RELATION_COLUMNS`, `SELECT_WITH_IMAGES`; added `listDiscover`, `findDetailById` |
| `backend/src/services/catalogService.ts` | deleted both inline mappers and their SQL; delegates to the repo |
| `backend/src/repositories/favoritesRepo.ts` | deleted `shapeProductImages`; uses `SELECT_WITH_IMAGES` + `mapProduct` |
| `lib/features/cart/domain/entities/cart_item.dart` | removed dead `CartItem.fromJson` |
| `backend/tests/product-contract.test.ts` | **new** — cross-surface contract suite |
| `test/product_promotion_contract_test.dart` | **new** — client model + card rendering |
| `test/api_integration_test.dart` | added a live cross-surface promotion test |

## 20.3 APIs affected

No breaking change: every affected response **gained** fields, none lost any, and no field changed
type or meaning.

| Endpoint | Change |
|---|---|
| `GET /api/favorites` | now returns `previousPrice`, `discountPercent`, `hasDeliveryPromo`, `deliveryPromoAmount`, `isActive`, `franchiseIds`, `createdAt`, `updatedAt` |
| `GET /api/catalog/products/:id` | now returns `deliveryPromoAmount`, `isActive`, `createdAt`, `updatedAt` |
| `GET /api/catalog/home` → `discover[]` | now returns `deliveryPromoAmount`, `isActive`, `createdAt`, `updatedAt` |
| `/catalog/products`, `/catalog/products/search`, home `offers`/`selectedProducts`, all `/admin` product routes | **unchanged** — already canonical |

## 20.4 Verified after the fix (same product, real API)

```
SURFACE           prevPrice  disc%  hasPromo  promoAmt   price  stock
catalog list          20000     25      True      2500   15000      7
product detail        20000     25      True      2500   15000      7
home offers           20000     25      True      2500   15000      7
home selected         20000     25      True      2500   15000      7
home discover         20000     25      True      2500   15000      7
search                20000     25      True      2500   15000      7
favorites             20000     25      True      2500   15000      7
discover: 10 products, 0 with missing fields
```

Verified per requirement: normal price, sale price (`previousPrice` → `price`), promotion flags
(`isOffer` / `isSelected`), discount amount (`previousPrice − price`), discount percentage
(server-derived), `deliveryPromoAmount`, promotion badges (`−25٪` rendered by `_badgeLabel`),
availability (`stock`, `isActive`), and category information (`categoryId`, `subcategoryId`).

## 20.5 Discount formula — one place only

`discountPercent` is derived inside `mapProduct` and nowhere else. It is never accepted as input.
Two independent guards back it:

- `products_previous_price_higher` — the database rejects `previous_price <= price`, so a negative
  or zero discount cannot exist as data.
- `mapProduct` returns `null` unless `previousPrice > price`, so no badge renders without a real
  discount.

Flutter never computes a discount: `Product.hasDiscount` only tests presence and ordering of
server-supplied values, and `discountedPrice` is simply `price`.

## 20.6 The cart line is deliberately not a product

`cartRepo.mapLine` stays a separate shape — it models a cart *line* (`unitPrice`, `lineTotal`,
`quantity`, `optionValue`), not a catalogue product. It carries `hasDeliveryPromo` and
`deliveryPromoAmount` because checkout needs them, and a test asserts those match the catalogue
values exactly. The cart UI renders no discount badge, so no promotion field is missing in practice.
Left as-is deliberately: unifying it would mean embedding a full product in every cart line, which
is a larger architectural change than this batch calls for.

## 20.7 Tests

`backend/tests/product-contract.test.ts` — 5 tests:
required-field contract across all 7 product surfaces (aggregating every gap in one failure rather
than stopping at the first); literal value equality of all promotion fields across those surfaces;
the discover list's contract for *all* its products regardless of the random slice; server-derived
discount (absent `previousPrice` → `null` percent, and the DB constraint proven to reject an
inverted price); and cart-line promo parity with the catalogue.

`test/product_promotion_contract_test.dart` — 5 tests: the client model parses every promotion
field; a stripped payload degrades silently (documenting *why* the bug was invisible); the card
renders the `−25٪` badge and the delivery-promo line; the line disappears when the amount is
missing (the exact pre-fix symptom); no badge without a previous price.

`test/api_integration_test.dart` — live cross-surface promotion test through the real Flutter data
layer against the running server. It **skips** unless the dev catalogue contains a product with both
a previous price and a delivery promo; create one from the admin dashboard to exercise it.

| Suite | Result |
|---|---|
| Backend `npx vitest run` | **160 passed** (155 + 5 new) |
| Flutter `flutter test` | **285 passed, 1 failed** — the pre-existing catalog data gap (§19.13.1) |
| `flutter analyze` | clean |
| Admin `npm run build` | clean |

## 20.8 Remaining issues

1. **`Product.categoryName` and `Product.subcategory` are never populated by any catalogue
   endpoint.** The Flutter model reads them but no product query joins `categories` /
   `subcategories`; only `reviewsRepo` emits `categoryName`. No screen currently displays them (the
   category screen receives its title through route arguments), so nothing is visibly broken. Now
   that mapping is centralised this is a one-place change — but it adds a join to every product
   query, so it is left as a deliberate decision rather than folded into a bug-fix batch.
2. **The cart line remains a distinct shape** — see §20.6.
3. **`api_integration_test.dart` "أقسام الإكسسوارات والحقائب" still fails** — the pre-existing
   catalogue content gap documented in §19.13.1, unrelated to mapping.
4. **Response payloads grew slightly** for favorites, detail and discover (`createdAt`, `updatedAt`,
   `franchiseIds`, `isActive` now included). Consistency was judged worth more than the few bytes;
   trimming would mean reintroducing per-surface shapes, which is the defect this batch removed.

---

# STEP 21 — ADMIN DASHBOARD EXPANSION
*2026-08-25 · points visibility · birthday management · notifications · banners · lifecycle CRUD · business configuration*

Everything below reuses the systems that already existed. No second points ledger, no second
birthday field, no second notification system, no second settings table, no new database tables.

## 21.1 Points visibility — `IMPLEMENTED`

| Endpoint | Returns |
|---|---|
| `GET /admin/customers/:id/points` | `customer` (id, username, phone, isActive, createdAt), `balance`, `ledger[]` with `label`, `amount`, `reason`, `orderId`, `reviewId`, `createdAt` |
| `GET /admin/points/summary` | `totalInCirculation`, `totalAwarded`, `totalRevoked`, `ledgerEntries`, `customersWithPoints`, `byReason[]`, `topBalances[]` |

Both read `points_ledger` through the existing `pointsRepo`. The balance stays derived
(`SUM(amount)`) — there is still no stored balance column that could drift.

**What is deliberately not exposed:** addresses, order contents, and every other column of the
customer record. A test asserts the customer object has exactly five keys.

**Read-only, deliberately.** No manual grant endpoint exists. Every ledger row corresponds to a real
event and is protected by a unique index (`uq_points_order_received`, `uq_points_review`) that makes
double-awarding impossible. A hand-written grant has no event to key on, so it would break that
guarantee and make balances unexplainable. Tests assert `POST /admin/customers/:id/points` is not a
route.

**UI:** `PointsPage` (totals, distribution by reason, top balances, per-customer ledger modal) plus a
«النقاط» column on `CustomersPage` opening the same ledger.

## 21.2 Birthday management — `IMPLEMENTED`

The page and endpoint already existed; this batch added **registration status** and a filter:

`GET /admin/customers/birthdays?filter=registered|pending|all` — `pending` lists customers who are
*eligible* (≥1 completed order) but have not registered, which is the question the previous
registered-only view could not answer. Each row carries `isRegistered` (derived from `birth_day`,
not a new column), `birthdaySetAt`, `completedOrders`, `discountUsedThisYear`, `isActive`.

### The "asked once" rule — verified, not assumed

The rule is enforced in SQL, not in the client:

```sql
UPDATE users SET birth_day = $2, birth_month = $3, birthday_set_at = now()
 WHERE id = $1 AND birth_day IS NULL AND birth_month IS NULL
```

Because the authoritative state is a column on `users` and the app asks the server
(`GET /birthday` → `hasBirthday`) rather than reading local storage, the behaviour survives logout,
reinstall, and device change by construction — there is nothing on the device to lose.

**Verified end-to-end against the running server** (§21.9).

## 21.3 Admin notifications — `IMPLEMENTED`

| Endpoint | Supports |
|---|---|
| `GET /admin/notifications` | `page`, `limit`, `type`, `userId`, `read` |
| `GET /admin/notifications/stats` | `total`, `unread`, `recipients`, `byType[]` |

Both go through the existing `notificationRepo` against the same `notifications` table the app reads.

**Read-only for notifications.** There is no admin route to mark a customer's notification read —
"read" is state the recipient owns, and forging it corrupts their unread counter without them ever
opening the message. A test asserts that route does not exist.

**Reminder controls** reuse the endpoints that already existed (`PATCH /admin/orders/:id/reminder`,
`POST /admin/orders/:id/reminder/send-now`) and are surfaced on the same page: current
`ratingAvailableAt`, whether the reminder was already sent, editing the timing, and sending now.

**Duplicate protection is unchanged and verified.** Both the scheduler and "send now" write
`rating_reminder_sent_at` inside the same atomic statement that inserts the notification, so whoever
marks the row first wins. Verified live: first send succeeded, second returned
`REMINDER_ALREADY_SENT`, and the database held exactly one rating reminder for that order.

## 21.4 Banners — pipeline verified, two real defects fixed

**The image pipeline works and was verified end-to-end before any change** (§21.9). The root cause of
the historical complaint was fixed in §18.5 (the carousel discarded the banner data).

Two genuine defects were found while verifying and are now fixed:

**(a) `POST`/`PATCH` returned a different shape from `GET`.** Create and update returned the raw
database row (`image_url`, `destination_type`, `is_active`) while the list returned camelCase. A
single exported `toBannerDto` in `storefrontRepo.ts` is now used by all three. Same defect class as
the product mappers in §20, on another table.

**(b) [CRITICAL] Editing a banner's image silently erased its destination.** `updateBanner` parsed
with `adminBannerSchema.partial()`, and **Zod's `.partial()` does not remove `.default()`** — so an
absent `destinationType` was filled with `'none'`. Changing only the image reset the destination to
`none` while leaving `destination_value` populated: a broken banner in an internally inconsistent
state, with no error. A dedicated `adminBannerUpdateSchema` with no defaults now backs `PATCH`, so an
absent field means "unchanged" as PATCH requires. Regression-tested.

`title` and `destinationType` were already editable and listed in the admin UI; both are covered by
the shape tests. Flutter still ignores them (bug **B-10**, unchanged — no destination-navigation
architecture exists yet, and inventing one was out of scope).

## 21.5 Lifecycle CRUD — `IMPLEMENTED`

| Endpoint | Guard |
|---|---|
| `DELETE /admin/categories/:id` | `409 CATEGORY_HAS_DEPENDENTS` if any product or subcategory references it |
| `PATCH /admin/subcategories/:id` | name / sortOrder / isActive (parent category is immutable) |
| `DELETE /admin/subcategories/:id` | `409 SUBCATEGORY_HAS_DEPENDENTS` if any product references it |
| `DELETE /admin/governorates/:id` | `409 GOVERNORATE_HAS_DEPENDENTS` if any order or delivery zone references it |

**Nothing cascades.** A deleted product would vanish from closed orders and from customers' carts; a
deleted governorate would tear a hole in a settled financial record. Each handler counts dependents
first and refuses with a message naming what blocks the deletion, so the admin can move the items or
deactivate instead. Verified live: the guards refused, and the dependent row counts were identical
before and after.

Franchise CRUD was already complete and was not rewritten. Its image field was verified through the
full path — admin upload → `franchises.image_url` → `GET /admin/franchises` → served `200`.

## 21.6 Business configuration — `IMPLEMENTED`

Extends the existing `store_settings` key/value table and its `SETTING_KEYS` allowlist. **No new
table.** Five keys were added:

| Key | Default (current production value) | Range |
|---|---|---|
| `points_order_received` | 20 | 0–10000 |
| `points_review_approved` | 1 | 0–10000 |
| `points_review_with_photo` | 5 | 0–10000 |
| `birthday_discount_percent` | 5 | 0–100 |
| `order_rating_delay_hours` | 24 | 0–720 |

`businessConfigService` is the only place that converts, validates, and falls back. Two distinct
behaviours, deliberately:

- **Reading** falls back silently to the code default when a stored value is missing or corrupt — a
  bad row must never drop an order or block a points award.
- **Writing** rejects with a message. An admin who typed `500%` must see the rejection, not believe
  they saved something the system quietly ignored.

Clearing a field (empty or `null`) restores the default; the API distinguishes `value` (what is
stored, `null` = unset) from `effectiveValue` (what runs now), so the admin can tell "set to 20" from
"unset, so 20".

**Deployment is behaviour-neutral:** until an admin edits something, every key is unset and every
value is the constant that was already in the code.

### What stays out, and why

`bcrypt` rounds, JWT lifetime, OTP lifetime and attempt ceiling, rate limits, and upload caps remain
in code/environment. These are security parameters — exposing them as ordinary commercial settings
would make weakening the system a one-click operation from a browser. A test asserts no key matching
`jwt`, `bcrypt`, `otp`, `rate_limit`, or `upload` appears in the business settings response.

`LOW_STOCK_THRESHOLD`, `MAX_COLLECTIONS_PER_USER`, and `COMMUNITY_LIMIT` were also left alone: they
are operational/UI tuning, not commercial levers, and moving every constant into the database was
explicitly out of scope.

### [CRITICAL] Points history is never rewritten

`points_ledger.amount` stores the amount awarded **at the moment of the award**. Configuration is
read at award time only, and the balance is `SUM(amount)` over rows that already exist. Raising
`points_review_approved` from 1 to 5 therefore leaves every prior row at 1.

Verified live: a customer with a 1-point row had the setting changed to 5, then received a new award.
The old row stayed at 1, the new row was 5, and the balance became 6 — not 10.

### [CRITICAL] Rating countdowns are never restarted

`order_rating_delay_hours` feeds the *existing* rating lifecycle; no second mechanism was added. The
value is read when a status transition occurs and written into `orders.rating_available_at` at that
moment. Both writers are already guarded — `markDispatched` by `WHERE dispatched_at IS NULL` and
`markDelivered` by `COALESCE(rating_available_at, …)` — so a persisted timestamp is never rewritten.

**Defined behaviour: newly dispatched/completed orders use the current value; existing orders keep
the timestamp they already have.** The scheduler reads the same column, so it cannot disagree with
what the app shows. Covered by a test that changes the setting and asserts an existing order's
`rating_available_at` is byte-identical.

## 21.7 Database changes

**None.** No migration was added in this batch. `store_settings` gained rows (created on first write
by the existing upsert), not columns; every other feature reads tables that already existed.

## 21.8 Tests

`backend/tests/admin-dashboard.test.ts` — **31 tests**: authorization (401 without a token, 403 for a
customer, on every new route including writes); points (ledger with reasons, exposed-field whitelist,
404 for unknown customer, summary derived from the ledger, no mutation route); notifications
(filter by type / user / read state, pagination without overlap, stats, no admin mark-read route);
lifecycle (409 with dependents + dependent counts unchanged, successful delete when empty,
subcategory patch/delete); business settings (defaults when unset, persistence, invalid values
rejected, clearing restores default, corrupt stored value falls back, no security keys present,
**points history immutable across a config change**, **existing `rating_available_at` unchanged**);
banners (identical key set across POST/PATCH/GET, **image-only PATCH preserves destination**, public
feed shape).

| Suite | Result |
|---|---|
| Backend `npx vitest run` | **191 passed** (160 + 31 new) |
| Backend `tsc --noEmit` | clean |
| Flutter `flutter test` | **284 passed, 1 skipped, 1 failed** — the pre-existing catalog data gap (§19.13.1) |
| `flutter analyze` | clean |
| Admin `tsc -b` | clean |
| Admin `vite build` | clean |

**The admin React app still has no test runner** — by decision, behavioural coverage for the new
admin functionality lives in the backend suite where it exercises the real endpoints. Adding Vitest +
React Testing Library remains open (§21.11).

## 21.9 Real end-to-end verification

Run against the development server and database, not mocks.

**Points.** Real customer; award written at the effective config value (1); admin endpoint returned
`balance=1`, `reason`, `createdAt`, and exactly the five whitelisted customer keys; config changed to
5; new award taken at 5; **old row still 1, balance 6**.

**Birthday.** Status before any order: `unlocked=false`. Real order created and driven
`CONFIRMED → PREPARING → OUT_FOR_DELIVERY → COMPLETED` through the admin API; 20 points auto-awarded.
Birthday registered → `birth_day=14, birth_month=8, birthday_set_at` present. Admin page showed
`registered=true, 14/8, completedOrders=1`. Second order created → `hasBirthday` still true, prompt
not shown; changing it refused with `BIRTHDAY_ALREADY_SET`. Fresh login (new token) → still
`hasBirthday=true, 14/8`, prompt not shown.

**Notifications.** Three real notifications produced by the order flow appeared in admin; type filter,
user filter, read/unread filter, and pagination (`page1: 2 items hasMore=true`, total 3) all correct.
Reminder timing edited (`delayHours=2` moved `ratingAvailableAt`); "send now" succeeded; second
"send now" refused with `REMINDER_ALREADY_SENT`; database held **exactly one** rating reminder.
(The order also carries a separate `receiptReminder`-typed "order received" notification — a
different message that shares the type; see §21.11.)

**Banners.** Upload → create with title + category destination → POST/PATCH/GET all returned the same
seven camelCase keys → image changed → public `/catalog/home` returned the new URL → image served
`200 image/png`. After the fix, an image-only PATCH left `destinationType=category` and its value
intact.

**Lifecycle.** Category with 7 products → `409`, products before/after both 7. Empty category →
deleted, 0 rows remain. Subcategory patch → 200; delete with 3 products → `409`. Governorate with 64
orders → `409`, orders before/after both 64. Empty governorate → deleted.

**Business settings.** Valid write 200 and persisted (`value=12, effective=12, default=5,
usingDefault=false`); invalid `500` rejected with a range message; clearing restored all five keys to
`usingDefault=true` with effective values 20 / 1 / 5 / 5 / 24.

**Franchise media.** Upload → `franchises.image_url` → `GET /admin/franchises` → served `200`.

## 21.10 Files modified

**Backend:** `repositories/settingsRepo.ts`, `repositories/pointsRepo.ts`,
`repositories/notificationsRepo.ts`, `repositories/catalogRepo.ts`, `repositories/storefrontRepo.ts`,
`repositories/userRepo.ts`, `services/businessConfigService.ts` *(new)*, `services/adminService.ts`,
`services/orderService.ts`, `services/reviewsService.ts`, `services/pointsService.ts`,
`controllers/adminController.ts`, `controllers/adminExtrasController.ts`, `validators/admin.ts`,
`routes/admin.ts`, `tests/admin-dashboard.test.ts` *(new)*.

**Admin:** `types/points.ts`, `types/notifications.ts`, `types/businessSettings.ts` *(all new)*,
`types/birthdays.ts`, `api/pointsApi.ts`, `api/notificationsApi.ts`, `api/businessSettingsApi.ts`
*(all new)*, `api/customersApi.ts`, `api/categoriesApi.ts`, `api/governoratesApi.ts`,
`pages/PointsPage.tsx`, `pages/NotificationsPage.tsx` *(both new)*,
`components/BusinessSettingsCard.tsx` *(new)*, `pages/BirthdaysPage.tsx`, `pages/CustomersPage.tsx`,
`pages/CategoriesPage.tsx`, `pages/GovernoratesPage.tsx`, `pages/SettingsPage.tsx`, `App.tsx`,
`layouts/nav.tsx`.

**Flutter:** none. No Flutter behaviour changed in this batch.

## 21.11 Remaining limitations

1. **Two different notifications share the `receiptReminder` type** — the "order received"
   confirmation and the "rate your order" reminder. Filtering by that type in admin returns both.
   Separating them needs a new enum value (migration + Flutter `NotificationType`), which was out of
   scope for a batch told not to touch the notification system.
2. **The admin React app has no test runner** (§21.8).
3. **Banner `title` / `destinationType` are still ignored by Flutter** (B-10) — storing and editing
   them works; acting on them needs a destination-navigation architecture that does not exist yet.
4. **No manual points adjustment** — deliberate (§21.1). If the business ever needs goodwill grants,
   it needs a designed event type with its own idempotency key, not a free-form amount field.
5. **`points_ledger.reason='manual'`** is still only reachable by direct SQL.
6. **Business config is read per call** (one small query per award / order transition). Fine at
   current volume; add a short-TTL cache if it ever shows up in profiling.
7. **`api_integration_test.dart` "أقسام الإكسسوارات والحقائب" still fails** — the pre-existing
   catalog content gap of §19.13.1, unrelated to this batch.

---

# STEP 22 — MEDIA PIPELINE AUDIT (ALL IMAGE TYPES)
*2026-08-25 · one representation, end to end · two real defects fixed*

## 22.0 Scope and method

Every column that can hold a media reference was enumerated from
`information_schema`, then every pipeline was traced end to end:
admin upload → storage driver → database → API → client model → resolver → image widget → cache.

**Media columns (8).** `banners.image_url`, `categories.image_url`, `franchises.image_url`,
`media_files.url`, `order_items.image_url`, `product_images.url`, `reviews.photo_url`,
`users.avatar_url`.

**`subcategories` has no image column** — "subcategory images" do not exist in this schema. The admin
subcategory form carries a name and sort order only. Nothing was added; the gap is noted, not invented.

## 22.1 Stored representation — audited, correct

Counted across the development database:

| Column | rows | empty | `/uploads/…` | absolute | other |
|---|---|---|---|---|---|
| `banners.image_url` | 2 | 0 | 2 | 0 | 0 |
| `categories.image_url` | 6 | 4 | 2 | 0 | 0 |
| `franchises.image_url` | 1 | 1 | 0 | 0 | 0 |
| `media_files.url` | 39 | 0 | 39 | 0 | 0 |
| `order_items.image_url` | 84 | 2 | 8 | 74 | 0 |
| `product_images.url` | 23 | 0 | 2 | 21 | 0 |
| `reviews.photo_url` | 4 | 1 | 1 | 2 | 0 |
| `users.avatar_url` | 98 | 94 | 3 | 1 | 0 |

**Zero rows anywhere contain an absolute URL pointing at this server's own `/uploads/`** — the defect
migration 021 removed has not returned through any write path. The remaining absolutes are external
hosts (`placehold.co` seed data, plus `img.test` / `cdn.test` / `x` left by test runs against the dev
database); `resolveMediaUrl` passes full external URLs through unchanged, by design.

## 22.2 URL builders — audited, single per layer

| Layer | Builder | Call sites |
|---|---|---|
| Backend | `LocalDiskStorage.save` → `${publicPath}/${storageKey}` | the only writer of a media reference |
| Flutter | `resolveMediaUrl` / `resolveMediaUrls` (`core/network/media_url.dart`) | 7 entity `fromJson`s |
| Admin | `resolveMediaUrl` (`utils/media.ts`) | 11 display sites |

`config.publicBaseUrl` is not used to build any stored reference. No layer has a second, competing
builder. Every `Image.network` call site in Flutter (8 of them) receives an already-resolved URL from
an entity; none concatenates a URL inline.

## 22.3 [CRITICAL] Defect 1 — the resolved avatar URL was persisted to the device

`User.fromJson` resolved `avatarUrl` into an **absolute** URL, and `User.toJson` wrote that absolute
value back. `AuthCubit` persists `jsonEncode(user.toJson())` into secure storage at three call sites.

**This is exactly the bug migration 021 removed from the database, reintroduced in the Flutter cache
layer** — and worse, because it lives on the device and survives restarts. A session saved on the
Android emulator stored `http://10.0.2.2:4000/uploads/avatar/…`; opened later on a real device, a
staging build, or production, that origin is unreachable and the avatar is permanently broken until
the session is cleared.

Reproduced before the fix:

```
toJson()['avatarUrl'] → 'http://10.0.2.2:4000/uploads/avatar/2026/08/abc.png'
after switching origin to staging, restored avatarUrl → still 10.0.2.2
```

**Fix.** `User` now stores `avatarRef` — the reference exactly as the server sent it — and exposes
`avatarUrl` as a **computed getter** that resolves against the origin in force *at read time*.
`toJson` persists `avatarRef`. Nothing resolved is ever written to disk, and a restored session
follows whatever origin the app is running against now. Widgets are unchanged: they still read
`user.avatarUrl`.

## 22.4 [CRITICAL] Defect 2 — the media origin could drift from the API base

`_mediaOrigin` was set once from `AppConfig` at DI time, while `ApiClient` can be constructed with an
arbitrary `dio` base URL. When the two disagree, **the API works and only images fail** — a
particularly hard failure to diagnose, because nothing errors except image loads.

This was not hypothetical: the integration suite constructs `ApiClient` against
`http://localhost:4000/api`, but the media origin stayed at the boot default and every `/uploads/`
fetch resolved to `http://10.0.2.2:4000/…` and timed out. The same drift occurs in the product if
`--dart-define=API_BASE_URL` is used to point at a LAN address while media resolution is configured
from somewhere else.

**Fix.** `configureMediaOriginFromBaseUrl(String)` was added, and `ApiClient` calls it from its own
effective base URL in the constructor. The media origin **is** the API origin, enforced structurally —
they can no longer be configured independently.

## 22.5 Cache behaviour — audited, no change needed

The requirement was to use cache invalidation "only where technically appropriate". It is not
appropriate here, and adding it would be wrong:

| Layer | Behaviour | Evidence |
|---|---|---|
| Storage keys | `randomUUID()` per upload — a key is never reused | `storage/index.ts`; test asserts 4 uploads of identical bytes produce 4 distinct URLs |
| `/uploads` HTTP | `Cache-Control: public, max-age=2592000, immutable` | correct **because** a URL's bytes can never change |
| API responses | no cache headers at all | grep: none set |
| Flutter HTTP | no Dio cache interceptor | grep: none |
| Flutter images | `Image.network` → in-memory `ImageCache`, keyed by URL | cleared on process restart |

**Changing an image always produces a new URL, so the old cached entry is never consulted.** Verified
live: replacing a product image produced a different URL, and the two URLs served content with
different checksums.

Cache-busting query strings (`?v=…`) were deliberately **not** added. They would defeat the
legitimate 30-day caching of genuinely immutable files and buy nothing, since staleness is already
impossible.

What *is* time-bounded is **data** freshness, not image freshness: the home screen loads once in
`initState` and refreshes on pull-to-refresh or app restart. A banner changed in admin therefore
appears on the next refresh or restart — correct behaviour, and unrelated to image caching.

## 22.6 Defect 3 — test fixture used a representation production never produces

`tests/helpers.ts#registerUploadedPhoto` built an **absolute** URL from `config.publicBaseUrl` and
inserted it into `media_files`. Every review-photo test therefore exercised a shape the system has not
produced since migration 021, so a regression in the relative-reference path could not have been
caught there. It now writes the relative reference the storage driver actually produces.

## 22.7 Verification

### Automated (repeatable, in CI)

`backend/tests/media-contract.test.ts` — **9 tests**: every upload purpose
(`product`/`category`/`banner`/`avatar`/`franchise`) returns a relative reference and records the same
value in `media_files`; repeated uploads never reuse a key; and every surface that returns media
emits the same representation — catalog list, product detail, home (banners, categories, offers,
selected, discover), `/auth/me`, favorites, community photos, cart lines, and the admin product,
category, banner, franchise and customer routes. A shared assertion rejects any reference matching
`^https?://…/uploads/` — the exact shape of the original defect. Writes are covered too: three
absolute avatar values are rejected with 400.

`test/media_reference_persistence_test.dart` — **6 tests**: display resolves against the current
origin; `toJson` persists the relative reference and contains no origin; a session saved under one
origin resolves correctly under another; external URLs round-trip untouched; absent images stay
absent; repeated save/restore cycles do not accumulate origins.

`test/api_integration_test.dart` — a new test walks every `/uploads/` reference returned by the live
`/catalog/home` through the app's own model + resolver and performs a **real HTTP GET** on each,
asserting `200` and an `image/*` content type. This is the end-to-end proof that the resolved URL is
actually fetchable, not merely well-formed.

### Manual, against the running server and database

Upload for all five purposes returned `/uploads/...` and served `200`. For each type: admin write →
database value → public API value were byte-identical relative references —
product (`/uploads/product/…`), category, banner, avatar. Changing a product image produced a new URL
whose content checksum differed from the old one, with both still served. An absolute avatar value was
rejected with `400`.

### Device verification — **NOT PERFORMED**

`flutter devices` reports only **Linux desktop** and **Chrome**; `flutter emulators` reports none, and
`adb` is not installed. **No Android or iOS device verification was carried out, and none of the
above should be read as such.**

A Flutter **web** run was attempted as the closest available substitute. The app compiled, served, and
successfully called the API through CORS (`/api/catalog/settings` → 200), but did not advance past the
splash screen in this headless environment, so **no screenshot of a rendered image was obtained and
the widget painting layer was not visually verified.** The pipeline below the widget — resolver output
and real image fetch — is covered by the automated test above.

Still requiring a human on a real device: that `Image.network` visibly paints product, category,
banner and avatar images, and that they survive an app restart on that device.

| Suite | Result |
|---|---|
| Backend `npx vitest run` | **200 passed** (191 + 9 new) |
| Backend `tsc --noEmit` | clean |
| Flutter `flutter test` | **291 passed, 1 skipped, 1 failed** — the pre-existing catalog data gap (§19.13.1) |
| `flutter analyze` | clean |
| Admin `tsc -b` / `vite build` | clean |

## 22.8 Files modified

**Backend:** `tests/helpers.ts` (relative fixture), `tests/media-contract.test.ts` *(new)*.
No production backend code required changes — the storage, database and API layers were already
consistent.

**Flutter:** `lib/features/auth/domain/entities/user.dart` (persist the raw reference),
`lib/core/network/media_url.dart` (`configureMediaOriginFromBaseUrl`),
`lib/core/network/api_client.dart` (bind media origin to the API base),
`test/media_reference_persistence_test.dart` *(new)*, `test/api_integration_test.dart` (real fetch test).

**Admin:** none — every call site already treated `resolveMediaUrl` as display-only and persisted the
raw upload result.

**Database:** no migration; no schema change.

## 22.9 Remaining limitations

1. **No device verification** (§22.7). This is the main gap in this batch.
2. **Test-run litter in the development database** — `img.test`, `cdn.test`, `http://x/y.png` in
   `product_images`, `order_items`, `reviews`, `users`. Harmless (external references pass through)
   but they are not real content; left untouched because deleting another suite's fixtures is not
   this batch's call.
3. **`subcategories` has no image column** (§22.0) — if subcategory images are wanted, that is a
   schema addition, not a pipeline fix.
4. **`order_items.image_url` is a historical snapshot** taken at order time and is intentionally not
   re-resolved; if the product image later changes, the order keeps the image the customer bought
   from. Correct, but worth knowing when auditing counts.
5. **Home data refreshes on pull-to-refresh or restart, not live** (§22.5) — a deliberate data-freshness
   choice, not an image-cache defect.

---

# STEP 23 — DELIVERY CONFIRMATION & RATING TIMING AUDIT
*2026-08-25 · verification batch · one new defect found and fixed*

This batch audited existing behaviour rather than changing it. The delivery/rating lifecycle was
found **already correct**; the work was proving it, closing two coverage gaps, and fixing one
unrelated crash discovered while doing so.

## 23.1 Delivery confirmation on app entry — `VERIFIED`

**Backend is the only authority.** `GET /orders/pending-confirmation` →
`orderRepo.findAwaitingConfirmation` returns the oldest order in `OUT_FOR_DELIVERY` for that customer,
or `null`. Nothing local decides whether the prompt appears — a grep for local-storage gating of the
confirmation found nothing.

**Flutter gate** (`main_navigation_screen.dart`):

| Trigger | Mechanism |
|---|---|
| Normal launch | `initState` → `addPostFrameCallback` → `_checkPendingConfirmation()` |
| App resume / already running | `didChangeAppLifecycleState(resumed)` → same call |
| Notification tap | routes to `OrderDetailRoute`, which renders its own «هل استلمت طلبك؟» card for `OUT_FOR_DELIVERY` |
| Multiple orders | backend returns one at a time, oldest first; the next surfaces on the next check |
| Duplicate screens | `_askingConfirmation` re-entrancy flag guards the whole async path |

«ليس بعد» adds the order to an in-memory `_deferred` set — a per-session UX deferral, not an
authority: the backend still reports it pending, and it reappears next launch.

Confirming routes to `OrderDetailRoute(confirmOnOpen: true)` so points, the birthday prompt and the
rating hand-off run through **one** path rather than two copies.

## 23.2 Dynamic rating — `VERIFIED`

`ratingAvailable` is computed **in SQL** on the server:

```sql
(o.rating_available_at IS NOT NULL AND o.rating_available_at <= now()) AS rating_available
```

The client never derives availability from the device clock, so moving the phone's time forward does
not unlock rating. Flutter's `Order.timeUntilRating` derives the remaining duration from the server's
`ratingAvailableAt` at read time and clamps negatives to zero; `_ReviewInvite` renders
`formatRemaining(...)` and disables the button while locked.

**No `24` is hardcoded anywhere in the Flutter rating path** — verified by grep and now guarded by a
source-scanning test.

## 23.3 Admin delivery timing — `VERIFIED`

`PATCH /admin/orders/:id/reminder` writes `rating_available_at` only, guarded by
`dispatched_at IS NOT NULL AND rating_reminder_sent_at IS NULL`. `delivered_at` is untouched. The
scheduler and the customer API read the *same column*, so they cannot disagree.

The configurable `order_rating_delay_hours` (§21.6) applies at transition time: a newly dispatched
order gets the current value, an already-dispatched order keeps its persisted timestamp.

## 23.4 Scheduler — `VERIFIED, unchanged`

`dispatchDueRatingReminders` marks `rating_reminder_sent_at` and inserts the notification in one
atomic statement with `FOR UPDATE SKIP LOCKED`. "Send now" uses the same guard, so whichever fires
first wins and the other becomes a no-op. No second scheduler was created.

## 23.5 [CRITICAL] Defect found — an idle DB disconnect killed the whole server

While running the scenarios, the development server **died**:

```
[rating-reminder] أُرسل 1 تذكير تقييم
node:events:487  throw er; // Unhandled 'error' event
error: terminating connection due to administrator command   (code 57P01)
```

**Root cause.** `pg.Pool` was created with no `'error'` listener. The pool emits `'error'` when an
**idle** pooled client is dropped by the database — failover, `pg_terminate_backend`, an
administrative restart, or a middlebox reaping idle connections. In Node an `'error'` event with no
listener is not a warning; it is an uncaught exception that ends the process. A single transient
blip therefore took down the API **and the rating-reminder scheduler that lives in the same process**.

**Fix.** `createPool` now attaches an `'error'` listener that logs and continues. The pool discards the
broken client and opens a fresh one on the next query, which is the documented `pg` behaviour.

**Proving the test is not vacuous.** The first version of the regression test passed with *and*
without the fix — its `pg_terminate_backend` filter matched nothing. It was rewritten to hold a client,
record its PID, release it so it sits idle, then terminate that exact PID from a **separate**
connection outside the pool. Without the guard the run now reports
`Unhandled Errors … code: '57P01'`, and an explicit assertion on `db.listenerCount('error')` makes the
test **fail** rather than merely warn. Verified both ways: fails without the guard, passes with it.

## 23.6 Scenario results

| Scenario | How verified | Result |
|---|---|---|
| **A** — delivered T0, window T0+24h, confirm after 1h | automated + **live** | `rating_available_at` byte-identical before and after confirm; `delivered_at` stamped; rating stayed locked |
| **B** — confirm after the window elapsed | automated + **live** | `ratingAvailable=true` before and after; a real review submitted `200` |
| **C** — close/reopen before the window | Flutter tests | remaining recomputed from the server stamp at each read; never stored on the entity |
| **D** — admin changes timing | automated | customer API and scheduler both follow the new persisted value; `deliveredAt` untouched; a new order uses the configured delay while an existing one keeps its stamp |
| **E** — pending appears, confirm, reopen | automated + **live** | pending returned the order, then `null` after confirmation |

Live runs used the development server and database with real HTTP calls, then the probe data was
removed.

## 23.7 Tests added

`test/rating_window_contract_test.dart` — **8 tests**: the server's `ratingAvailable` wins even when
the stamp disagrees (a past stamp with `ratingAvailable:false` stays locked — the device-clock guard);
remaining time follows the server for 1/6/24/48/72-hour windows; no counter is invented when no stamp
exists; Scenario C recomputation; and a source scan asserting no `Duration(hours: 24)` or
`Duration(days: 1)` in `lib/features/orders` or `lib/features/reviews`.

`backend/tests/order-rating-lifecycle.test.ts` — **2 tests added**: Scenario D now asserts the
*customer-facing* API reflects an admin reschedule (previously only the scheduler was checked), and
the configurable delay applies to the next order without moving an existing one.

`backend/tests/db-resilience.test.ts` — **1 test**: the pool survives an idle-client termination.

| Suite | Result |
|---|---|
| Backend `npx vitest run` | **203 passed** (200 + 3 new) |
| Backend `tsc --noEmit` | clean |
| Flutter `flutter test` | **299 passed, 1 skipped, 1 failed** — the pre-existing catalog data gap (§19.13.1) |
| `flutter analyze` | clean |
| Admin `tsc -b` / `vite build` | clean |

## 23.8 Files modified

**Backend:** `src/database/pool.ts` (error guard — the only production change),
`tests/order-rating-lifecycle.test.ts`, `tests/db-resilience.test.ts` *(new)*.

**Flutter:** `test/rating_window_contract_test.dart` *(new)*. **No production Flutter code changed** —
the rating path was already server-driven.

**Database / API / Admin:** unchanged.

## 23.9 Remaining limitations

1. **The gate's re-entrancy and resume behaviour is verified by reading, not by an automated test.**
   `MainNavigationScreen` needs the router, DI and `AuthCubit` to instantiate; a widget test would be
   mostly harness. The backend contract underneath it is fully covered.
2. **`_deferred` («ليس بعد») is per-session** — the prompt returns on the next launch while the order
   is still out for delivery. Intended, but worth stating.
3. **Two different notifications share the `receiptReminder` type** (§21.11) — unchanged here.
4. **No device verification** — no Android emulator or `adb` in this environment (§22.7).
5. **`api_integration_test.dart` calls `markTestSkipped` when the backend is down but the tests still
   run and fail.** Pre-existing harness weakness, unrelated to this batch; the suite must be run with
   the dev server up.

---

# STEP 24 — THREE-ENVIRONMENT SPLIT (dev / staging / prod)
*2026-08-25 · environment separation across Flutter, backend, admin and Git*

Operational reference lives in [`README.md`](README.md). This section records what
changed and, importantly, what was and was not verified.

## 24.1 Two real defects found during the split

**(a) [CRITICAL] staging and production shared one API host.** `AppConfig.staging`
and `AppConfig.production` both pointed at `https://api.otaku-galaxy.example/api`.
A staging build would have written to production data with nothing to indicate it.
They now have distinct hosts, and `config_test.dart` asserts they can never be
equal again.

**(b) [CRITICAL] staging inherited development's security posture.** `isProduction`
was `nodeEnv === 'production'`, so a staging deploy fell into the *development*
branch of every secret check: the marked dev JWT fallback was accepted, the fixed
OTP `123456` could be enabled, `SMS_PROVIDER=console` was allowed, and seeding was
permitted. A host carrying realistic data with development-grade auth is the worst
combination available. `requiresRealSecrets = (prod || staging)` now governs all of
it — verified live: staging refuses to boot without `JWT_SECRET`/`DATABASE_URL`,
and refuses `DEV_OTP_ENABLED=true`.

A third, smaller issue: `usesCleartextTraffic="true"` applied to **every** Android
build including production. It is now scoped to the dev flavor's manifest.

## 24.2 Git

Branches `dev`, `staging`, `prod`, all created from one commit so they start
identical. `prod` is the GitHub default. `master` is retained as a historical
pointer only.

Release path is `dev → staging → prod`, never `dev → prod`. Pull requests state
direction explicitly (`base` = destination, `compare` = source).

**Protection (verified by attempting a direct push, which was rejected):**

| | `staging` | `prod` |
|---|---|---|
| Pull request required | ✅ | ✅ |
| Approving reviews | 0 | 1 |
| Required status checks | 3 | 3 |
| Branch must be up to date | ✅ | ✅ |
| Force push | ❌ | ❌ |
| Deletion | ❌ | ❌ |
| Applies to admins | ✅ | ✅ |

`enforce_admins` matters: with it off, protection *warned* but the owner's direct
push to `prod` still succeeded. It is now on for both branches.

## 24.3 Flutter

Three entry points (`main_dev` / `main_staging` / `main_prod`) delegating to one
shared `main_common.dart`. No application code is duplicated. The legacy
`main.dart` still honours `--dart-define=APP_ENV`.

Android flavors `dev` / `staging` / `prod`. **The production `applicationId` is
unchanged** (`com.otakugalaxy.otaku_galaxy`) so Play Store updates are unaffected;
dev and staging carry `.dev` / `.staging` suffixes so all three coexist on a device.

## 24.4 Backend

`APP_ENV` (`dev`/`staging`/`prod`) selects the environment and its file. Loading
order — process environment → `.env.<APP_ENV>` → `.env` — so deployment secrets can
be injected without ever touching disk. Templates are committed
(`.env.<env>.example`); real files are gitignored.

`DOTENV_CONFIG_PATH`, when set, loads *only* that file. This preserves the test
isolation contract: without it, the fixtures re-loaded the developer's `.env` and
the production fail-fast tests silently passed while testing nothing. That
regression was introduced and caught during this batch.

## 24.5 Admin dashboard

Vite modes `dev` / `staging` / `prod` with per-mode `.env` files. A **DEV** or
**STAGING** badge appears in the header; production shows none — the three
dashboards are otherwise identical, so the badge is the practical guard against
editing the wrong database.

## 24.6 Verification

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | clean |
| Backend `vitest` | **209 passed** (203 + 6 new staging-hardening tests) |
| staging refuses to boot without secrets | **verified live** |
| staging refuses `DEV_OTP_ENABLED=true` | **verified live** |
| dev still boots with fallbacks | **verified live** |
| `npm run dev` + real API call | **verified live** (`/catalog/home` → 200) |
| `flutter analyze` | clean |
| `flutter test --exclude-tags integration` | **291 passed** |
| Admin `tsc -b` | clean |
| Admin build in all three modes | **verified**, each bakes a different API host |
| Direct push to `prod` / `staging` | **verified rejected** |

**Not verified — Android builds.** `flutter build apk --flavor …` cannot complete
in this environment: only a JRE is installed (`javac` absent), so Gradle fails at
`compileDevDebugJavaWithJavac`. What *was* verified is that Gradle configures the
flavors and generates every expected variant task — `assembleDevDebug`,
`assembleStagingDebug`, `assembleProdRelease`, `bundleProdRelease` all resolve.
Completing an actual APK/AAB needs a JDK and must be confirmed by the maintainer.

## 24.7 Remaining limitations

1. **Android/iOS builds unverified** (§24.6). iOS flavors (schemes + xcconfigs)
   were not configured at all — Xcode is unavailable here.
2. **API hosts are placeholders.** `*.otaku-galaxy.example` does not resolve.
   Real hosts must be set in the env files, or passed via
   `--dart-define=API_BASE_URL`. `AppConfig.usesPlaceholderApi` logs a warning.
3. **No staging or production database exists yet** — both must be provisioned.
4. **CI has never run**; its checks are required by branch protection, so the
   first pull request will be what actually exercises the workflow.

---

# STEP 25 — DEV AUDIT & GAP ANALYSIS
*2026-08-29 · dev branch only · two repository-level defects found and fixed*

Documentation-and-audit batch. Operational status now lives in
[`README.md`](README.md) §9–§10 with explicit ✅ / ⚠️ / ❌ / 🔧 labels; this
section records what the audit found.

## 25.1 [CRITICAL] The repository was missing 23 source files

`flutter analyze` **passes locally but failed in CI** with
`Target of URI doesn't exist: …/auth_repository_impl.dart`. The files exist on
disk; they were never committed.

**Root cause.** `.gitignore` carried a bare `data/` rule under a
"Database / local dev" heading. A bare pattern matches at **every** depth, so it
excluded `lib/features/*/data/` — thirteen directories holding the entire
Flutter data layer (repositories and local datasources). 191 Dart files existed
under `lib/`; only 168 were tracked.

**Consequence.** A fresh clone could not build the app. The only reason this was
invisible is that every working copy already had the files.

**Fix.** The rule is anchored to the repository root (`/data/`), which is what
the "local dev database" intent meant. All 191 files are now tracked.

This is exactly the class of defect that only surfaces on a clean checkout, and
CI is what surfaced it.

## 25.2 [CRITICAL] Concurrent migration runs corrupted each other

The backend CI job failed with
`duplicate key value violates unique constraint "pg_class_relname_nsp_index"`.

**Root cause.** `runMigrations` had no mutual exclusion. `CREATE TABLE IF NOT
EXISTS` is not concurrency-safe in PostgreSQL: two sessions both pass the
existence check, then collide on a system catalogue index.

**Reproduced locally** — two concurrent runners against an empty schema: one
succeeded, the other failed with `pg_type_typname_nsp_index`.

**Fix.** The runner takes a session-scoped `pg_advisory_lock` for the duration
of the run and releases it explicitly. Re-verified: both concurrent runners now
succeed (one applies 24 migrations, the other no-ops), and a third run is a
clean no-op.

## 25.3 Known failing Flutter test — classified, not fixed

```
test/api_integration_test.dart
  أقسام الإكسسوارات والحقائب
```

**Classification: TEST DATA PROBLEM (pre-existing).** The test asserts every
subcategory of «إكسسوارات» holds at least one product; 5 of its 8 are empty in
the development database. Those subcategories were created through the admin
dashboard — the seed script defines only three.

**Not an application defect** — verified live that the API returns
`success: true` with `0` items for an empty subcategory rather than erroring.

Deliberately **not fixed**: the remedy is a merchandising decision (stock those
subcategories) or a test-scope decision (stop asserting catalogue completeness),
and neither is mine to make. Both options are recorded in README §10.

## 25.4 Security audit — no findings

| Check | Result |
|---|---|
| `.env` files tracked or in history | none — only `*.example` templates and an intentionally empty test fixture |
| Hardcoded secrets in tracked source | none |
| Real values in committed templates | none — all `change_me_*`, `USER:PASSWORD`, `*.example` |
| Production URL leaked into dev config | none; each environment's host lives in its own `AppConfig` entry |
| Dev or staging pointing at a production database | no; templates are distinct per environment |
| CORS | empty allow-list when unset, which blocks all cross-origin |
| Rate limiting | global + per-purpose auth limiters active |
| Secrets in logs | none; the seed logs the admin phone and explicitly not the password |

Authorization coverage already asserted by existing tests: unauthenticated
requests rejected, customers blocked from admin routes, customers unable to read
or confirm another customer's order, unable to review another customer's order,
unable to moderate reviews; and idempotency on points, stock restoration,
reminders and the birthday registration.

## 25.5 Verified state

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | clean |
| Backend `vitest` | **209 passed** (15 files) |
| Admin `tsc -b` | clean |
| Admin `vite build` (dev / staging / prod) | all three succeed |
| `flutter analyze` | clean |
| `flutter test --exclude-tags integration` | **291 passed** |
| `flutter test` (backend running) | 301 passed, 1 skipped, 1 failed (§25.3) |
| Migration race, before/after fix | reproduced, then fixed and re-verified |

**Not verified:** Android and iOS builds. The environment has a JRE but no JDK,
so Gradle cannot compile; there is no emulator or device. Gradle *configuration*
of all three flavors was verified.

## 25.6 Gap summary

**P0 — before staging is possible:** provision a staging database and backend
host, generate staging secrets, replace the placeholder hostnames, and get one
green CI run.

**P1 — reliability:** connect a real SMS provider (the `http` provider is
implemented but has never spoken to a carrier), verify Android builds on a
machine with a JDK, configure iOS flavors, decide the catalogue-data question.

**P2 — later:** release signing (release currently signs with the debug key), a
deployment pipeline (CI runs tests only), backup/restore, monitoring, load
testing, and an admin dashboard test runner.

---

# STEP 26 — DEV: ADMIN DASHBOARD ENHANCEMENT & FEATURE INTEGRATION

**Branch:** `dev` only. Nothing was merged, deployed, or promoted to `staging`
or `prod`; no PR was opened. All schema changes are additive migrations applied
to the development database only.

This step is written the way the audit steps before it are: what already
existed, what was actually missing, what was built, and what was deliberately
**not** built. Only features verified in the repository are marked implemented.

## 26.1 Audit — what already existed

The request assumed several systems were missing. Most were not.

| Feature | Database | Backend | Admin UI | Flutter | Verdict before this step |
|---|---|---|---|---|---|
| Anime (`franchises`) | ✅ 014 | ✅ CRUD | ✅ page + product picker | ✅ browse | **Complete** except search |
| Delivery zones | ✅ 015 | ✅ server-side pricing | ✅ separate page | ✅ mandatory picker | **Complete**, but split across two screens |
| Notifications | ✅ 012 | ⚠️ single-user only | ⚠️ read-only + 1 recipient | ✅ inbox | **Partial** — no targeting |
| Galaxy Points ledger | ✅ 010 | ✅ | ✅ read-only | ✅ | **Complete** |
| Galaxy **levels** | ❌ | ❌ | ❌ | ⚠️ hardcoded `enum` | **Flutter only** |
| Birthday | ✅ 013 | ⚠️ 3 coarse filters | ⚠️ flat list | ✅ | **Partial** |
| Customers | ✅ 001 | ⚠️ page/limit only | ⚠️ no search | — | **Partial** |
| Banners | ✅ 004 | ✅ | ✅ CRUD | ✅ carousel | **Complete** — symptom already fixed |
| Categories/subcategories | ✅ 002 | ⚠️ no product filter | ⚠️ no drill-down | ✅ | **Partial** |
| Order state machine | ✅ 006 | ✅ | ✅ | ✅ | **Complete**, but two-step confirm |

Consequence: this step **extended** existing systems. No table, endpoint, or
screen was duplicated, and no working API was replaced.

## 26.2 Orders — the confirmation stage was removed, not renamed

`ORDER_STATUS_TRANSITIONS` changed:

```
PENDING_ADMIN_CONFIRMATION: ['CONFIRMED', 'REJECTED']   →  ['PREPARING', 'REJECTED']
```

Three consequences had to be handled rather than discovered later:

1. **`CONFIRMED` still exists.** Real orders stopped there. Deleting the value
   or its outgoing transition would strand those rows in a state the machine
   cannot move. It is reachable *out of*, never *into*.
2. **Notification ownership moved.** `PREPARING` now emits «تم قبول طلبك», but
   only from `PENDING_ADMIN_CONFIRMATION`. Without that condition, a legacy
   order moved out of `CONFIRMED` would send a second acceptance notification
   for one order.
3. **Customer cancellation window.** Cancelling was allowed in `PENDING` and
   `CONFIRMED`. Collapsing the stage would have silently removed the customer's
   ability to cancel the instant an admin clicked confirm. `PREPARING` was added
   to `CUSTOMER_CANCELLABLE_STATUSES` to preserve the existing right.

Flutter previously rendered `PREPARING` as «قيد التوصيل» and offered *confirm
receipt* on it — a button the server refuses with `NOT_OUT_FOR_DELIVERY`. Both
were corrected.

Eight existing tests drove the old path (`CONFIRMED → PREPARING → …`). They were
updated to the new path, not deleted; the two that assert transition behaviour
specifically were rewritten to assert the new rule.

## 26.3 Anime search — the data existed, the path did not

`franchises` and `product_franchises` shipped in migration 014, but
`productRepo.search` matched `products.name` alone. A product named «قلادة فضية»
tagged *Demon Slayer* was unreachable to anyone searching the anime.

Migration `025` adds `alt_names TEXT[]` plus a `franchise_search_text()` helper.
Search now matches product name **or** franchise name **or** any alias, and
skips inactive franchises so hiding an anime hides it from search too.

## 26.4 Bind-parameter defect found during implementation

The first birthday/audience implementation interpolated `$1` (timezone) and `$2`
(window days) directly into the filter conditions. PostgreSQL **rejects any
statement passed more parameters than it references**, so filters that need
neither — «لم يسجّل ميلاده», «له طلبات» — failed with a 500 while the others
worked. Caught by an existing dashboard test before it reached a screen.

Fixed by binding both parameters in an explicit scope join used by every query:

```sql
FROM users u CROSS JOIN (SELECT $1::text AS tz, $2::int AS days) k
```

Conditions read `k.tz` / `k.days` by name, so both parameters are always
referenced regardless of the filter. The same latent defect existed in the
audience builder and was fixed the same way.

## 26.5 Timezone — «today» is the customer's calendar

`config.storeTimezone` (`STORE_TIMEZONE`, default `Asia/Baghdad`) is passed into
every birthday query. A UTC server rolls over at 03:00 Baghdad time: tomorrow's
greeting would arrive three hours before today ended, and the real birthday
would be classified as "yesterday". Migration `026` adds `next_birthday()` and
`safe_birthday_date()`, which handle year-wrap and 29 February (celebrated on
the 28th in non-leap years instead of dropping the customer from every list).

## 26.6 Loyalty levels — moved out of the app binary

Migration `027` creates `loyalty_levels`, seeded with the **exact** values that
were in `otaku_level.dart`, so the upgrade changed nothing visible.

Two invariants are enforced in the database, not by convention:

- `required_points` is `UNIQUE` — two equal thresholds make "current level" a
  question with no single answer.
- A deferred constraint trigger requires **an active level at 0 points**. Without
  it, deleting or disabling the base level leaves every new customer (balance 0)
  off the ladder with no level at all.

**[CRITICAL] The ledger is never rewritten.** A test compares every
`points_ledger` row before and after a threshold edit and asserts they are
byte-identical. Editing a threshold changes how a balance is *interpreted*,
never its amount.

Flutter has **no fallback ladder** on purpose. A cached local ladder would show
a customer a reward cancelled a month ago and look correct.

## 26.7 Strict payload validation for broadcasts

`audience: "all"` sent together with `userIds: [two customers]` used to be
accepted — Zod strips unknown keys by default — and the announcement would reach
**every** customer while the admin believed they were messaging two. The
broadcast schema is now a `.strict()` discriminated union; the contradictory
payload is rejected with 400 and a test asserts **zero** notification rows are
created. No message can be recalled after sending.

## 26.8 Deliberately NOT implemented

| Requested | Status | Why |
|---|---|---|
| Scheduled notification sending | ❌ Not implemented | No calendar scheduler exists. The only scheduler is the rating reminder, driven by order state. Nothing would fire a scheduled send. |
| Automatic birthday greetings | ❌ Not implemented | Same reason. Greetings are sent by an admin click; the screen says so. |
| Push notification delivery | ❌ Not implemented | No provider connected. The API returns `push: null` and the UI states records are in-app only. |
| Banner start/end dates | ❌ Not implemented | The column does not exist and was not invented. |
| Manual points adjustment | ❌ Not implemented (pre-existing decision) | Every ledger row mirrors a real event guarded by a unique index. A manual grant with no event breaks that guarantee. |

## 26.9 Verification

| Command | Result |
|---|---|
| `backend: npx tsc --noEmit` | ✅ clean |
| `backend: npx vitest run` | ✅ **281 passed** (22 files) |
| `admin: npx tsc -b` | ✅ clean |
| `admin: npx vite build --mode dev\|staging\|prod` | ✅ all three |
| `flutter analyze` | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **292 passed** |
| `flutter test test/api_integration_test.dart` (live dev backend) | ⚠️ 10 passed, 1 skipped, **1 failed — the pre-existing empty-subcategory data problem from STEP 25, unchanged** |

Verified in the running dev application (browser, real dev database):

- Order **#93**: one click on «تأكيد الطلب» → status `PREPARING`, history
  `['PENDING_ADMIN_CONFIRMATION', 'PREPARING']` — no intermediate stage.
- Unified **المحافظات والتوصيل** screen: 10 governorates, Najaf expanding to two
  zones; inside-district fee set to 3,000 and read back from the public
  `/catalog/governorates/:id/zones` endpoint as 3,000 / 4,000.
- **Banners**: `/catalog/home` returns two active banners with relative
  references; both images served `200` with correct content types.
- **Loyalty ladder** rendering with live customer counts per level (104/1/0/0,
  reconciling with 105 customers).
- **Customer search**: `0771` → 13 of 105, filtered in SQL.
- **Birthdays**: «لم يسجّل ميلاده» → 102 customers, timezone displayed as
  `Asia/Baghdad`; composer opened pre-targeted with a live audience count of 102
  and the "in-app record, not push" warning.
- **Responsive**: drawer navigation confirmed at 319 px viewport.

A bug was found *during* browser verification and fixed: the broadcast
composer's reset effect depended on an object literal rebuilt by its parent on
every render, so it re-ran continuously and would have wiped whatever the admin
was typing. It now resets only on the closed → open transition.

## 26.10 Not verifiable in this environment

- **Android / iOS builds and on-device runs** — no JDK (`javac` absent), no
  emulator, no device. Unchanged from STEP 25.
- **Flutter UI rendering** — the web build launches and reaches the dev backend
  (verified: `GET /api/catalog/settings` → 200 from the browser), but Flutter
  renders to canvas and the preview pane cannot capture frames here, so no
  screenshot-level UI verification was possible. The Flutter data layer is
  covered instead by the integration suite above, run against the live backend.

---

# STEP 27 — DEV: DYNAMIC CHARACTER ARTWORK

**Branch:** `dev` only. Not merged, deployed, or promoted. One additive
migration applied to the development database only.

## 27.1 What existed before

The preceding audit (see the Character Art Slots report) established the
baseline: 48 references in `lib/`, 12 illustration files, ~30 placements, heavy
reuse (`a-i0.png` in seven places), 22 of 24 inline `Image.asset` calls without
error handling, and no disk image cache. The backend already had uploads, MIME
sniffing, a storage driver, `media_files`, relative URLs and immutable cache
headers. Nothing about image handling needed inventing.

This step therefore **extended** that infrastructure. No table, endpoint or
upload component was duplicated.

## 27.2 The single design decision everything follows

An unconfigured slot is **omitted** from `/catalog/visuals` rather than returned
empty. Absence is the fallback signal.

The alternative — returning every slot with a possibly-empty image list — forces
the app to distinguish "not configured" from "configured with nothing", two
states that mean the same thing to it. Omission makes the post-upgrade state
(no rows at all) and the deleted-image state identical and correct, with no
branch in the client.

`ManagedArtwork.fallbackAsset` is required for the same reason. An optional
fallback would let one forgotten call site render nothing on a customer's phone.

## 27.3 Rotation is resolved server-side

`GET /catalog/visuals` returns the chosen `currentUrl`, the full `urls` list for
prefetching, and `validUntil`.

Resolving on the device would have meant: a character that changes whenever a
widget rebuilds, two phones disagreeing because their clocks differ, and a user
able to see tomorrow's character by moving their clock forward. The daily index
is `((now() AT TIME ZONE store_tz)::date - epoch) % count`, computed in SQL —
no device state, no randomness, stable for the whole store day.

## 27.4 Guards added at the database level

- `slot_key` is `UNIQUE` and CHECK-constrained to `^[a-z][a-z0-9_]{2,48}$`. A key
  with a space or an Arabic letter would store fine and then match no
  `ManagedArtwork` in the app — a slot that looks configured and never appears.
  The validator repeats the same pattern so the rejection is a 400, not a 500.
- `UNIQUE (slot_id, url)` — the same image twice in one slot skews daily
  rotation for no benefit.
- Images are ordered by `sort_order, created_at`. Without the second key, two
  images sharing a `sort_order` have undefined order, and the daily index picks
  a different one between requests on the same day.
- `ON DELETE CASCADE` from slot to images: an image has no meaning outside its
  slot. Files on disk are left alone — that is a separate cleanup decision.

## 27.5 Migration of existing artwork

| Category | Count | Action |
|---|---|---|
| A — must stay local | 5 placements | Untouched: splash ×2, offline gate art, offline gate logo, store logo |
| B — migrated | 25 placements | Now `ManagedArtwork` across 16 slots |
| C — static UI | 0 | None found; every remaining `Image.asset` is either a fallback branch or Category A |

No bundled asset was deleted. Every migrated placement kept its original file as
the required fallback.

Five design-system widgets gained an optional `artworkSlot` alongside the
existing `artwork` path (`OtakuScreenHeader`, `AnimeEmptyState`,
`OtakuEditorialPanel`, `AnimeGuestPrompt`, `AuthScaffold`), so 23 call sites
changed by exactly one added argument and no layout changed.

## 27.6 Security review

- Read is public and read-only; there is no write handler on the customer route.
- All mutations sit behind `adminRoutes`, which enforces auth + admin role
  before the controller runs. Verified: customer token → 403, no token → 401,
  on every mutation path.
- Uploads keep the existing magic-byte MIME sniffing; `purpose: 'slot'` is
  admin-only because `mediaController` already restricts non-admins to `review`
  and `avatar`. Verified: customer uploading `purpose=slot` → 403.
- A `/uploads/` URL that has no `media_files` row is rejected
  (`MEDIA_NOT_FOUND`), so a slot cannot be pointed at a dangling reference.
- Image mutations verify the image belongs to the named slot, so an image id
  from another slot returns 404 rather than silently succeeding.
- **Upload ceiling left at 5 MB** as instructed. Character art renders at
  76–250 px wide, so a lower ceiling or upload-time resizing is worth
  considering — documented here rather than changed silently.
- No `.env` committed, no secrets introduced, no production database touched.

## 27.7 Verification

| Command | Result |
|---|---|
| `backend: npx tsc --noEmit` | ✅ clean |
| `backend: npx vitest run` | ✅ **303 passed** (23 files) — 22 new |
| `admin: npx tsc -b` | ✅ clean |
| `admin: vite build --mode dev\|staging\|prod` | ✅ all three |
| `flutter analyze` | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **309 passed** — 17 new |

Verified against the running DEV stack with real data:

- Baseline `/catalog/visuals` → `{ slots: [], timezone: "Asia/Baghdad" }`, so an
  unconfigured install renders bundled assets.
- Two real images uploaded with `purpose=slot`, a slot created, both attached.
- Chosen image served `200 image/png` with `Cache-Control: public,
  max-age=2592000, immutable`.
- Daily rotation returned the identical URL across five consecutive reads.
- `validUntil` = `21:00Z` = midnight Baghdad.
- Disabling every image → slot omitted (app falls back); re-enabling → returned.
- Dashboard page renders the slot with preview, counts, rotation and per-image
  active state; the detail drawer shows both images with ordering and controls.
- Flutter DEV app fetched `GET /api/catalog/visuals → 200` at splash and
  downloaded **exactly one** image — the selected one, not the whole list.

## 27.8 Not verified

- **Android / iOS builds and on-device runs** — no JDK (`javac` absent), no
  emulator, no device. This step adds `cached_network_image`, which pulls
  `sqflite` and `path_provider` — **native plugins**. The Android and iOS builds
  must be run on a machine with a working toolchain before this is trusted.
- **Disk cache persistence across cold starts** — on Flutter web the browser
  HTTP cache does the work (the immutable header covers it); the real disk cache
  path is mobile-only and could not be exercised here.
- **Visual comparison of migrated screens** — Flutter renders to canvas and this
  environment cannot capture frames. Layout is unchanged by construction (same
  widget, same size arguments, artwork swapped inside), and 309 widget tests
  pass, but a human should look at the screens.

## 27.9 Promotion status

This implementation remains **DEV-only**. It is NOT ready to be promoted to
staging until the remaining application features are complete and tested, and
until the Android/iOS builds have been verified on a machine with a working
toolchain.

---

# STEP 28 — DEV: FULL VISUAL SLOT CATALOGUE

**Branch:** `dev` only. One additive migration (`029`) on the development
database. Nothing merged, pushed, deployed, or promoted.

STEP 27 built the mechanism with 16 role-based slots. This step completes the
coverage: an exhaustive scan of the Flutter source, one slot per placement, and
a dashboard that groups them by where they appear.

## 28.1 The scan

| Search | Hits |
|---|---|
| `Image.asset(` | 10 |
| `AssetImage` / `ExactAssetImage` | **0** |
| `DecorationImage` | **0** |
| `'assets/` literals (any form) | **47** |

`Image.asset` plus the named parameters (`artwork:`, `fallbackAsset:`, `asset:`,
`art:`) are therefore the complete surface. Reusable widgets were traced to
their call sites rather than counted once: `_Art` in onboarding serves three
slides, `_PromoCard` serves two cards, and each now carries its own slot.

47 literals = 5 permanently local + 42 managed.

## 28.2 Granularity decision

STEP 27 used role slots (`auth_header` for four screens). That was wrong for
this product: the shop owner thinks "the login screen character", not "the auth
header role". Split to **one slot per placement**.

Only two slots remain shared, and both are shared *in the code* — a single
literal serving several screens — not merged by choice:

- `auth_cta_character` — one panel inside `AuthScaffold`.
- `guest_prompt_character` — one default in `AnimeGuestPrompt`.

Splitting either would require adding a parameter to a widget so that four
screens could pass four different values for something that is visually one
element. That is complexity bought with nothing.

## 28.3 Seeding is safe

Migration 029 seeds all 42 slots with label, location and group. This is the
difference between a dashboard the owner can browse and one that demands they
know internal Dart identifiers.

It changes nothing in the app: `listPublished` requires at least one **active
image**, so a seeded-but-empty slot is still omitted, and every screen still
renders its bundled asset. A test asserts exactly this — published count equals
total slots minus slots without active images.

## 28.4 The silent-failure guard

A slot key is a contract between two sides that never meet: the server sends
`slot_key`, and `ManagedArtwork` asks for a Dart constant written by hand. A
one-character typo throws nothing and logs nothing — the slot looks configured
in the dashboard, the admin uploads an image, and the app never changes. Only
someone diffing the two files by eye would find it.

`backend/tests/visual-catalogue.test.ts` is that diff, automated: it parses
`lib/features/visuals/domain/visual_slot.dart` with a regex and compares the
extracted keys against `visual_slots` in both directions. It also asserts every
row has a label, a location and a real group, and that no key contains `splash`,
`offline`, `logo` or `brand`.

## 28.5 Verification

| Command | Result |
|---|---|
| `backend: npx tsc --noEmit` | ✅ clean |
| `backend: npx vitest run` | ✅ **310 passed** (24 files) |
| `admin: npx tsc -b` | ✅ clean |
| `admin: vite build --mode dev\|staging\|prod` | ✅ all three |
| `flutter analyze` | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **315 passed** |

Static cross-check: all 42 declared Dart constants are wired to a real call
site, and no call site references an undeclared key (set comparison, both
directions empty).

Live against the running DEV stack:

- `GET /admin/visual-slots` → 42 slots across 10 groups, each with label,
  location and group key.
- Dashboard renders them grouped by app area, showing «6 من 42 موضعاً مخصَّص»,
  with plain-Arabic locations and a «مضمَّن» tag on unconfigured slots.
- Six slots configured spanning five areas — auth, home, shopping, orders,
  rewards — and `GET /catalog/visuals` returns exactly those six.
- The Flutter DEV app logged
  `▶ [web] base=http://localhost:4000/api GET .../catalog/visuals`
  against the DEV backend.

## 28.6 Not verified

- **Android / iOS builds** — no JDK, no device. `cached_network_image` pulls
  `sqflite` and `path_provider`, which are native plugins; the mobile builds
  must be exercised on a real toolchain.
- **Per-screen visual comparison** — Flutter renders to canvas and this
  environment cannot capture frames. Layout is unchanged by construction (same
  widget, same size arguments) and 315 widget tests pass, but a human should
  look at the screens.
- **Disk cache across cold starts** — mobile-only path.

## 28.7 Promotion status

**DEV-only.** Not ready for staging until the remaining application features are
complete and the mobile builds are verified on a working toolchain.

---

# STEP 29 — DEV: IMAGE REPLACEMENT FIX + HOME/CATEGORIES UI

**Branch:** `dev` only. Three additive migrations (`030`–`032`) on the
development database. Nothing merged, pushed, deployed, or promoted.

## 29.1 Root cause — the replaced image never appeared

Reproduced before touching anything:

```
BEFORE: f145432b.png
uploaded replacement: cae7abd9.png
AFTER : f145432b.png      ← unchanged
```

**`fixed` rotation returns the image at `sort_order` 0. Uploading appended at
`MAX(sort_order) + 1`.** So a "replacement" landed at the end of a list whose
head was still the old image. The dashboard showed two images and the app kept
serving the first one, forever.

It is the worst shape a defect can take: no error, no log, nothing to notice
except that the dashboard and the phone disagree.

### The fix — replacement is now its own operation

`POST /admin/visual-slots/:id/images` takes `mode`:

| mode | behaviour |
|---|---|
| `append` | adds to the end — builds a rotation set |
| `replace` | deactivates every existing image and inserts the new one **first** |

Both happen in one transaction, so a failure midway cannot leave a slot with no
active image. The old image is **deactivated, not deleted**: the file stays on
disk, other things may reference it, and undo is one click.

The dashboard picks the mode automatically — uploading into a slot that already
has an active image means *replace*; "إضافة صورة إلى مجموعة التدوير" is the
explicit second action.

### Second cause — a running app never re-fetched

The configuration was read once at splash. An admin changing an image while the
app was open on a customer's phone would not be seen until a cold restart,
which nobody performs deliberately.

`VisualsRepository` now installs an `AppLifecycleListener` and re-fetches on
resume, throttled to two minutes. And it only bumps `revision` when the new
`version` hash differs, so a resume with no changes rebuilds nothing.

### Cache

Uploads mint a UUID filename, so a replacement is always a **new URL** — the
`immutable, max-age=30d` header stays truthful and no cache-busting query
parameter is needed. What needed a freshness signal was the *configuration*, and
that is the new `version` field on `GET /catalog/visuals`.

### Third defect, found during live verification

`prefetch()` awaited each image's `ImageStream` with no timeout. On platforms
where the listener never fires — Flutter web, which has no disk cache — the
loop stopped at the first image and **no image was ever prefetched**. Silent
again: no error, no log. Each warm-up now has an 8-second ceiling, and a test
asserts `prefetch()` returns even when every URL is unreachable.

## 29.2 Slot catalogue corrections

| Change | Reason |
|---|---|
| `home_categories_backdrop` **removed** (migration 031) | Its screen section was deleted; a slot for a location that no longer renders promises something that cannot happen |
| `social_tiktok` · `social_instagram` · `social_whatsapp` **added** (032) | The account screen used generic Material glyphs (a music note for TikTok). Brand logos cannot be bundled — they are trademarks — and no licensed icon package is present, so the shop owner uploads them |

Catalogue is now **44 slots**. The parity test between the Dart constants and
the database covers all of them, and it caught its own suite leaking throwaway
slots during this step — which is exactly what it is for.

## 29.3 Category card — the image was a background

`Image.network(fit: BoxFit.cover)` inside a `Stack(fit: StackFit.expand)`, with
a gradient veil painted over it so the text stayed readable. The uploaded
character swallowed the whole card and half of it disappeared under the veil.

Now a `Row`: text in the leading half, a dedicated 96px art area on the
trailing side — which in this RTL layout is the physical **left**, as asked.
`BoxFit.contain`, no veil, no background: a transparent PNG stays transparent
over the card's own gradient and is never stretched. The watermark letter
remains the fallback when no image is uploaded.

The per-category image already existed and is managed from the Categories page.
No parallel system was created for it.

## 29.4 Home — three blocks, one source

Before: hero baked into the code, promo rail baked into the code, and a
server-driven banner carousel underneath. The admin owned the least visible of
the three and none of the prominent ones.

Migration 030 adds `placement` (`hero` | `promo`) and `subtitle` to the existing
`banners` table, plus `anime` as a destination type.

- **Hero** — the first active `hero` banner. Image, title, subtitle and tap
  destination all come from it. Unset → the bundled design renders unchanged.
- **Promo rail** — every active `promo` banner, in the admin's order, unlimited.
  Empty → the two bundled cards render unchanged.
- **The third carousel is removed** from Home, and `banner_carousel.dart` was
  deleted rather than left as dead code. Existing banners were migrated to
  `promo` so nothing the admin had uploaded disappeared.

Destination is data, not code: a banner with no destination falls back to the
categories tab rather than swallowing the tap silently.

## 29.5 Product cards — measured, not guessed

The grid reserved a fixed `mainAxisExtent: 292`. Measured content height:

```
column 190 → 259     column 165 → 272     column 132 → 285
```

So on an ordinary phone every card carried **33px of dead space** below its
content. The constant had been sized for the narrowest phone and everyone paid
for it.

`productGridDelegate(context)` now derives the extent from the actual column
width and the user's text scale. Narrow phones keep the room they need.

## 29.6 Product image is never recoloured

`ProductPhotoSlot` applied a `ColorFilter.matrix` when stock hit zero — the
system was altering a photograph the shop owner uploaded and showing it in a
colour nobody chose. The filter and its parameter are gone; three call sites
were updated. Out-of-stock is stated by the existing `ProductStockPill` and a
new "نفدت" chip over the image corner.

## 29.7 Auth screens — the gap was in the wrong place

The reference puts `margin-top:auto` on the footer inside a full-height flex
column, so slack falls **between** the card and the footer. Flutter stacked the
footer directly under the card inside a `SingleChildScrollView`, so all the
slack collected **below** it — the reported empty space.

Now `LayoutBuilder` + `ConstrainedBox(minHeight: viewport)` + `Spacer()`: the
Flutter equivalent of that CSS. Content still scrolls when the keyboard opens.
No authentication logic, validation, navigation or artwork placement changed.

## 29.8 Verification

| Command | Result |
|---|---|
| `backend: npx tsc --noEmit` | ✅ clean |
| `backend: npx vitest run` | ✅ **315 passed** (24 files) |
| `admin: npx tsc -b` | ✅ clean |
| `admin: vite build --mode dev\|staging\|prod` | ✅ all three |
| `flutter analyze` | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **316 passed** |

Live on the DEV stack, the full replacement chain:

```
before   f5fe…  current 2562b8b1.png   version 5fa2470f29
upload   e9e29a2d.png, mode=replace → "استُبدلت الصورة"
after           current e9e29a2d.png   version f5fe5909db
served   200 image/png 344160b
images   e9e29a2d.png active · 2562b8b1.png INACTIVE
```

Also verified live: 44 slots grouped by location in the dashboard; the reworked
drawer showing the live image, a full-width centred drop zone and the
replace/append distinction; the banners page showing the new placement column;
`GET /catalog/home` returning `heroBanner` and two `promoBanners`; and the
Flutter DEV app logging
`▶ [web] base=http://localhost:4000/api GET .../catalog/visuals`.

## 29.9 Not verified

- **Android / iOS** — no JDK, no device. `cached_network_image` pulls native
  plugins (`sqflite`, `path_provider`); the mobile builds must be run on a real
  toolchain.
- **Disk cache across cold starts** — mobile-only. On web there is no disk
  cache, which is why `prefetch()` performs no downloads there (harmless: the
  display path fetches on demand and the browser HTTP cache applies).
- **Pixel-level comparison of the changed screens** — Flutter renders to canvas
  and this environment cannot capture frames. The changes are structural
  (dedicated art area, responsive extent, `Spacer`) and 316 widget tests pass,
  but a human should look at Home, Categories, Cart, Account and the auth
  screens.

## 29.10 Promotion status

**DEV-only.** Not ready for staging until the remaining features are complete
and the mobile builds are verified on a working toolchain.
# STEP 30 — DEV: ONBOARDING SCREEN 2 PRODUCT IMAGE

## 30.1 Goal

Add a real, locally-bundled image into the miniature "product card" on
**Onboarding Screen 2** of the user app, replacing the previous neutral photo
placeholder, so the card gives a visual hint of the real store card without
needing any network access.

## 30.2 Reference design

The source of truth is `Otaku Galaxy v2.dc.html`. In its **slide 2** (ob2)
markup the miniature product card is declared as:

```
position:absolute; bottom:214px; right:10px; width:112px; padding:9px;
border-radius:20px; background:var(--surf); border:1px solid var(--line);
box-shadow:var(--sh)
  └─ .img: height:52px; border-radius:13px; background:var(--ph);
       border:1px dashed var(--ph-line)
```

The reference card ships **no product image**: its image area is literally a
*photo placeholder* (the `--ph` tint, a dashed photo/landscape glyph, and two
loading bars). The reference asset tree also contains no product image at all
— only character art (`art/opt/*.png`) and the store logo.

## 30.3 Asset decision

- **Requested:** a real, visible product image that is available locally.
- **Constraint:** the onboarding runs fully offline (screen is documented
  "محلّية بالكامل — لا شبكة ولا خادم"); the shared real store card
  (`ProductPhotoSlot`) loads a **network** image, which is not acceptable here.
- **Local assets actually bundled** (registered in `pubspec.yaml`):
  `assets/art/opt/*.png` (anime character art) and
  `assets/branding/otaku-galaxy-logo.jpg`. The `assets/images/` folder holds
  uncutated downloaded anime images but is **not** registered in `pubspec.yaml`,
  so it is not bundled and was not used.
  > **Superseded by STEP 46.** `otaku-galaxy-logo.jpg` was deleted in the brand
  > refresh and replaced by `assets/branding/otaku-mark.png`. The decision this
  > section records is unaffected — the asset chosen here was
  > `assets/art/opt/a-luffy-kid.png`, which is unchanged.
- **Chosen:** `assets/art/opt/a-luffy-kid.png` — an already-registered,
  locally-bundled anime figure render that reads as a compact merchandise
  visual inside the 112×52px mini card.

## 30.4 Files changed

- `lib/features/onboarding/presentation/widgets/onboarding_slides.dart`
  — in `OnboardingSlideTwo`, the mini product card's image area
  (previously a `Container` with the `Icons.image_outlined` placeholder)
  now renders the bundled asset via `Image.asset` wrapped in a
  `ClipRRect(borderRadius: 13)` + `ColoredBox(photoSlot)` + `SizedBox`.
  The `BoxFit.cover` crops to the fixed 52px card height, the photo-slot
  backdrop remains beneath while loading, and an `errorBuilder` keeps it
  silent if the asset were ever removed. Card dimensions, radius, padding,
  floating animation and the two loading bars are unchanged.
- `PROJECT_FEATURE_SPEC.md` — this step.

## 30.5 Where the image was placed

Onboarding Screen 2 → "كل ما يخص عالمك، بمكان واحد" → floating mini product
card (start side, `bottom`-anchored) → the image area that occupies the top
of the card (52px tall, radius 13).

## 30.6 Verification

- `flutter analyze` → **No issues found!**
- `flutter test test/onboarding_screen_test.dart` → **11/11 passed** (6 RTL
  overflow checks across 3 sizes × light/dark, slide-1 content & indicators,
  advancing to slides 2–3, single `ابدأ التسوق` CTA, persistence).
- Programmatic slide-2 probe (throwaway test, since removed): the
  `Image.asset('assets/art/opt/a-luffy-kid.png')` was present on slide 2,
  rendered at non-zero size with no layout exception.
- `flutter build web --release` → built; asset confirmed bundled at
  `build/web/assets/assets/art/opt/a-luffy-kid.png`.

## 30.7 Runtime visual verification

**NO.** Flutter web renders to a `<canvas>` with no DOM text/click surface, and
screenshots of the continuously-animating onboarding (floating surfaces) are
torn, so the image could not be visually confirmed in a real renderer in this
environment. The change is verified structurally (asset bundled, present on
slide 2, non-zero size, no overflow) via widget tests and the web build only —
a human should confirm it visually on a device/emulator.

## 30.8 Scope / design note

Per the confirmed decision, a bundled anime art asset was used as the visible
mini-card image. This intentionally deviates from:
- the reference's literal *photo placeholder* (the reference simply provides
  no product image here), and
- the store's "no anime art inside product-image slots" rule, which governs the
  **real** product cards (`anime_product_card.dart`, `product_photo_slot.dart`)
  and does not apply to this decorative onboarding hint.

## 30.9 Promotion status

**DEV-only.** Not promoted; no commit/push/merge/deploy/staging/prod touched.

---

# STEP 31 — DEV: ONBOARDING 2 PRODUCT IMAGE RE-APPLIED + TWO WORKING-TREE PROBLEMS FOUND

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. Only
`onboarding_slides.dart` and this file changed.

## 31.1 Why this step exists — STEP 30's code change was not in the tree

STEP 30 documents this exact task (product image in the Onboarding-2 mini card, asset
`assets/art/opt/a-luffy-kid.png`). **That change was not present in the source when this step
began**: `OnboardingSlideTwo` still rendered the neutral placeholder —
`Container(...) → Center(child: Icon(Icons.image_outlined))`. Only the documentation survived.

The change was therefore re-applied. STEP 30's asset decision was **kept, not overridden**: its
text records `a-luffy-kid.png` as a confirmed decision, and an independent render comparison showed
both it and the alternative read acceptably at slot size, so there was no reason to substitute a
personal preference for a decision already taken with the user.

## 31.2 Implementation

Reference geometry (`Otaku Galaxy v2.dc.html`, slide 2) preserved exactly — card `112px` wide,
`padding:9`, `radius:20`; image slot `height:52`, `radius:13`. Only the slot's *content* changed
from placeholder glyph to a real image:

```dart
Container(
  height: 52,
  width: double.infinity,          // المرجع: عنصر كتلة يملأ عرض محتوى البطاقة
  decoration: BoxDecoration(
    color: context.themeColors.photoSlot,
    borderRadius: BorderRadius.circular(13),
    border: Border.all(color: theme.colorScheme.outlineVariant),
  ),
  clipBehavior: Clip.antiAlias,     // الصورة تتبع نصف قطر الفتحة
  child: Image.asset(
    'assets/art/opt/a-luffy-kid.png',
    fit: BoxFit.cover,              // يملأ بلا تشويه النسب
    alignment: Alignment.topCenter, // يُبقي الوجه داخل القصّ
    filterQuality: FilterQuality.medium,
    errorBuilder: ...,              // أصلٌ مفقود يعيد الرمز لا يُسقط الشريحة
  ),
)
```

`width: double.infinity` is the faithful translation of the reference's block-level `div`, and is
what makes the slot deterministic — without it the `Container` would size to the image's intrinsic
width instead of the card's content box.

**Local, never network** — onboarding runs before the first successful API call and may open with no
connectivity at all; a network image here means an empty card on first launch.

## 31.3 Verification — actually rendered, not inferred

The widget tree was rendered via `RepaintBoundary.toImage()` and the output inspected:

- Measured image rect: **90 × 50 px** — exactly the 94 × 52 slot minus the 1 px borders of the
  floating surface and the slot itself. It fills the content box precisely; no overflow.
- Visible, correctly clipped to the 13 px radius, face in frame under `topCenter`.
- Confirmed in **light**, **dark**, and on a **320 × 640** small screen — identical, since the card
  is fixed-width by reference design.

**A pitfall worth recording:** the first render showed the slot *empty* — and so did the slide's
main `trio-l` art. That was not a bug: `Image.asset` decoding is asynchronous and does not complete
under `tester.pump()`. Wrapping `precacheImage` in `tester.runAsync()` before capturing made both
appear. Anyone verifying images in widget tests will hit this and may wrongly conclude the image is
invisible.

| Command | Result |
|---|---|
| `flutter analyze` | ✅ clean, 0 issues |
| `flutter test --exclude-tags integration` | **387 passed, 1 failed** — the failure is pre-existing, see §31.4 |

## 31.4 [PRE-EXISTING] A failing test that this step did not cause

`test/onboarding_screen_test.dart › slide one … shows the brand header, title, body, chip and CTA`
fails: it expects `'أهلاً بك في مجرة الأوتاكو'`, but `onboarding_slides.dart:294` now reads
`'أهلاً بك في متجر مجرة الأوتاكو'` (the word «متجر» was added).

**Proven not caused by this step:** the change was isolated by temporarily reverting *only* this
step's image hunk and re-running — the test failed identically. The copy edit is someone else's
in-flight change sitting in the working tree.

The reference (`obTitles[0]`, line 2726) says **`'أهلاً بك في مجرة الأوتاكو'` — without «متجر»**,
so the code currently diverges from the reference and the test still encodes the reference. **Left
untouched deliberately**: reverting the wording would undo another session's intentional edit, and
updating the test would ratify a copy change whose intent is not this step's to decide. The fix is
one line either way, once the owner of that edit decides which is correct.

## 31.5 [DATA LOSS] `PROJECT_FEATURE_SPEC.md` was truncated by something outside this step

Earlier in the same working session this file was **8044 lines, ending at STEP 41**. It is now
**5481 lines, ending at STEP 30** (mtime `2026-08-31 09:38`). STEPs 31–41 — the engineering-quality
audit, the DEV→STAGING readiness audit, phone E.164 normalization, deployment infrastructure, the
real Docker verification, the restock/notification-preferences integration, and the splash work —
are **gone from the file**.

They were never committed (this branch has had zero commits throughout), so git cannot restore
them; they exist only in this session's transcript. The standing instruction across all these tasks
has been *append only, never rewrite history* — that instruction was violated by whatever replaced
this file, not by an append.

**Recommended:** commit `PROJECT_FEATURE_SPEC.md` soon so history stops being reconstructible only
from chat, and so a concurrent overwrite is recoverable.

## 31.6 Files changed

- `lib/features/onboarding/presentation/widgets/onboarding_slides.dart` — mini-card image slot only.
- `PROJECT_FEATURE_SPEC.md` — this step (appended).

Card geometry, radius, padding, float animation, the two loading bars, both other slides, and all
startup/routing logic are untouched.

## 31.7 Runtime visual verification

**NO — not on a device or emulator.** Verified by rendering the real widget tree offscreen and
inspecting the pixels (§31.3), which is stronger than static inspection but is not a device run.

Attempts made this session and why they failed: **Linux desktop** — build fails, `libsecret-1`
missing for `flutter_secure_storage_linux` (installing system packages was out of scope).
**Android** (a real device *is* connected, `EEFMR4OJ794LCQNV`) — Gradle's Kotlin compile daemon
could not start; the machine had ~1.2 GiB RAM free with swap nearly exhausted. **Flutter web** —
built successfully and served, but the pane capture did not complete before this step concluded.

## 31.8 Promotion status

**DEV only.** Nothing committed, pushed, merged, or deployed; `staging`, `prod`, and `master`
untouched.

---

# STEP 32 — DEV: PUSH NOTIFICATIONS + CART EMPTY STATE + AUDIT OF THREE ALREADY-DONE ITEMS

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. No provider credentials created or committed.

Five items were requested. **Two were already fully implemented, one was already satisfied, and two
needed real work.** Inspecting first — as instructed — avoided building duplicates of working
systems.

## 32.1 Kurdish localization — infrastructure ALREADY COMPLETE, but unused

Already present and correctly wired, not built by this step:
`AppLanguage.kurdish` (`ckb`), a full `_ckb` translation map, `LocaleCubit` with
`SharedPreferences` persistence, the selector in `personalize_screen.dart`, and in
`app/view/app.dart`: `locale`, `supportedLocales`, the three `GlobalMaterialLocalizations`
delegates, and a `localeResolutionCallback` that falls back to Arabic Material strings (Flutter
ships no `ckb` bundle). Switching language updates the UI immediately; both languages are RTL so
layout does not change.

**The real gap, measured:** `AppStrings` defines 34 keys but `context.strings` has **zero call
sites**, while `lib/` contains **~747 hardcoded Arabic string literals**. The translation layer is
complete and unreachable — switching to Kurdish changes almost nothing on screen.

**Not closed in this step, deliberately.** Routing ~747 literals across ~40 screens through the
localization layer and translating each is a multi-session migration with regression risk on every
screen, and it is a different task from the four others requested here. What was added instead is
the guard that makes such a migration safe: `AppStrings.keys` plus a test asserting **every** Arabic
key has a distinct Kurdish translation — a missing key silently falls back to Arabic (`call()`), so
without this a half-translated screen looks correct and reports nothing.

## 32.2 Social media icons from Admin — ALREADY COMPLETE

Verified end-to-end, nothing built:

| Layer | State |
|---|---|
| Backend | `updateSettingsSchema` validates `social_tiktok`, `social_instagram`, `social_whatsapp`; URLs must be `http(s)://` or empty; WhatsApp additionally accepts an international number |
| Admin | `SettingsPage.tsx` has all three fields with their icons and placeholders |
| Flutter | `StoreSettingsRepository` fetches them; `account_screen.dart` renders `links.tiktok/.instagram/.whatsapp` — **no hardcoded URL anywhere** |
| Refresh | Loaded on splash via `StoreSettingsRepository.refresh()`; an admin change needs no new app build |
| Empty/invalid | Empty means "unset" and the row keeps safe behaviour; the scheme check blocks `javascript:`/`data:` |

The social **icons** themselves are additionally dashboard-managed through the visual-slot system
(`VisualSlots.socialTiktok/socialInstagram/socialWhatsapp`).

## 32.3 Empty cart — CENTERED (real change), and a bug the code read would have missed

`AnimeEmptyState` gained an opt-in `centered` flag; `cart_screen.dart` passes `centered: true`.

**Opt-in, not a default change:** this component is shared by **11 screens**, and the side layout
(artwork breaking the panel edge, action pinned bottom-start) is what the reference specifies for
the rest. Flipping it globally would have redesigned ten screens nobody asked about.

**Bug found by measuring, not reading:** the first implementation rendered the "centered" column
**hugging the right edge** (centre at x=229 instead of 206). Cause: a non-positioned child of a
`Stack` is aligned to `AlignmentDirectional.topStart` — under RTL that is top-**right** — and gets
loose constraints, so it took the width of its widest child rather than the panel's. "Centred inside
a box that is itself stuck to the edge" is not centred. Fixed with `Positioned.fill`.

Verified by rendering the real widget: image `159–253` and button `101–311` both centre on **206.0**
= the panel centre exactly, with the image above the button.

## 32.4 Home header — ALREADY has no container

`_buildBrandHeaderWithSearch()` wraps its content in a `Container` whose decoration is
`const BoxDecoration()` — fully transparent, padding only. Logo, store name, search and bell already
sit directly on the Home background, for guests and authenticated users alike.

The only rectangular surfaces in that area are the **search CTA** and the **notification bell**
(`42×42, radius 15` — the reference's own numbers). Both are the interactive controls the request
explicitly said to keep. **Nothing was changed**, because the described container does not exist and
removing the two that do exist would delete Search and Notifications' affordances. If something
else was meant, pointing at it will make it a one-line change.

## 32.5 Push notifications — full architecture built, provider deliberately not connected

Nothing existed before (`grep` for firebase/fcm/push/device_token found nothing in either
`pubspec.yaml` or `backend/src`). The existing in-app system was **extended, not replaced** — its
`BroadcastResult` already reserved a `push` field as `null`, which now carries a real result.

### Database — migration `038_device_tokens.sql`

`device_tokens(id, user_id → users ON DELETE CASCADE, token UNIQUE, platform, is_active,
last_seen_at, created_at, updated_at)` + partial index `(user_id) WHERE is_active`.

**`UNIQUE` is on `token`, not `(user_id, token)`** — the security-relevant choice. Providers recycle
tokens between devices and apps; inserting a second row would leave the previous owner's row active
and deliver *their* notifications to *someone else's* phone. `ON CONFLICT (token) DO UPDATE`
transfers ownership instead. Rejected tokens are **deactivated, not deleted**, so a device that
stopped receiving leaves a trace.

### Backend
`deviceTokenRepo`, `pushService`, `services/push/index.ts` (a `PushProvider` interface mirroring the
SMS provider: `console` / `noop` / `fcm`, with `console`/`noop` **refusing to boot** in
staging/prod), validators, controller, and routes `GET|POST /api/devices` and
`POST /api/devices/unregister`.

**Security:** no endpoint accepts a client-supplied user id — every operation uses `req.auth!.id`.
The token itself is **never returned** in any response. Broadcasting stays behind `requireAdmin`.
Push failure never fails the request: the in-app record is written **first** and remains the source
of truth, since a push is a best-effort transient alert.

### Flutter
`PushTokenRepository` (talks to the backend — the token is **not** kept only in local storage),
`PushRegistrar` (permission → token → register → follow refresh; `onLogin`/`onLogout` wired into the
existing `AuthCubit` listener in `app/view/app.dart`), and `PushTokenSource`, the single seam to the
provider.

**Why `firebase_messaging` is not in `pubspec.yaml`:** it pulls the google-services Gradle plugin,
which hard-fails without `android/app/google-services.json`. That file is absent, and the app has
three flavors (`.dev`, `.staging`, production) with different application ids, so it needs one per
flavor. Adding the package now would have **broken the Android build for everyone** on the next
pull. `UnconfiguredPushTokenSource` returns no token and no error, so the whole system runs and is
tested without a provider — and does not pretend to deliver anything.

Logout unregisters **before** the session is cleared: the route is authenticated, so doing it after
would 401 and leave the device bound to the account that just logged out.

## 32.6 Provider configuration — required, not supplied

Added to `.env.staging.example` and `.env.prod.example` (placeholders only, **no secret committed**):
`PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `PUSH_TIMEOUT_MS`.

Still required before a phone can receive anything:
1. A Firebase project; `google-services.json` per flavor into `android/app/src/{dev,staging,prod}/`.
2. Add `firebase_core` + `firebase_messaging` and the google-services Gradle plugin.
3. Implement `FirebasePushTokenSource` against the existing `PushTokenSource` interface.
4. Complete `FcmPushProvider.obtainAccessToken()` (service-account JWT → OAuth2), or swap the class
   for `firebase-admin`. It currently **throws explicitly** rather than returning a fake token.
5. Android 13+ `POST_NOTIFICATIONS` runtime permission; iOS APNs key if iOS ships.

## 32.7 Tests

| Suite | Result |
|---|---|
| `backend: tsc --noEmit` | ✅ clean |
| `backend: vitest run` | ✅ **401 passed (37 files)** — 12 new in `push-devices.test.ts` |
| `flutter analyze` | ✅ clean |
| `flutter test` | **398 passed, 1 failed** — the failure is pre-existing, see §32.8 |
| `admin: tsc -b` / `lint` / `vitest` / 3 builds | ✅ clean / 0 warnings / 22 passed / all three |

New tests: device-token ownership, token recycling transferring owner, multi-device, cross-user
unregister refused, invalid platform/short token rejected, dead-token deactivation, admin-only
broadcast, in-app record written independent of push; Flutter push lifecycle (login/logout/refresh/
permission-denied/network-failure) and Kurdish key completeness; cart centring measured
geometrically.

**One existing test was updated, not weakened:** `admin-audience` asserted `push: null` from when no
provider existed. Its intent — never conflate "in-app record written" with "push delivered" — is
unchanged and now guarded more strongly: `recipients: 1` while `push.delivered: 0` for a customer
with no registered device, which proves the two numbers are independent rather than one derived
from the other.

## 32.8 Pre-existing failure, not from this step

`onboarding_screen_test.dart › slide one … brand header` expects
`'أهلاً بك في مجرة الأوتاكو'`; the code says `'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in
STEP 31 §31.4, where it was isolated by reverting that step's change and observing the identical
failure. Someone's in-flight copy edit; the reference file agrees with the test.

## 32.9 Real-device push verification

**NO.** No notification was delivered to any device, and none could be: no Firebase project, no
credentials, no `google-services.json`, and the FCM access-token step throws by design. What was
verified is the code path up to the provider boundary — token registration, ownership, recycling,
deactivation, admin authorization, and that the in-app record is written independently of push.

## 32.10 Files changed

**Backend (new):** `migrations/038_device_tokens.sql`, `repositories/deviceTokenRepo.ts`,
`services/pushService.ts`, `services/push/index.ts`, `validators/push.ts`,
`controllers/pushController.ts`, `tests/push-devices.test.ts`.
**Backend (modified):** `config/index.ts`, `services/notificationsService.ts`, `routes/customer.ts`,
`vitest.config.ts`, `tests/admin-audience.test.ts`, `.env.staging.example`, `.env.prod.example`.

**Flutter (new):** `features/notifications/data/push_token_repository.dart`,
`features/notifications/data/push_registrar.dart`, `test/push_and_locale_test.dart`,
`test/cart_empty_state_test.dart`.
**Flutter (modified):** `core/di/injection_container.dart`, `app/view/app.dart`,
`core/l10n/app_strings.dart`, `core/design_system/components/feedback/anime_empty_state.dart`,
`features/cart/presentation/screens/cart_screen.dart`.

**Admin:** none — social settings already complete.

## 32.11 Promotion status

**DEV only.** No commit, push, merge, or deployment; no staging/prod configuration touched; no
provider credentials created or stored.

---

# STEP 33 — DEV: FORCED APP UPDATE + RESPONSIVE MOBILE/TABLET LAYOUT

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. No secrets created or committed.

Two features. The first is new end-to-end; the second extends existing code rather than adding a
parallel system — no new settings store, no new HTTP client, no new routing, no new responsive
framework.

## 33.1 Forced update — backend

**Extended, not duplicated.** `store_settings` already existed with a validated allow-list; five
text keys were added to it (`app_min_supported_version`, `app_latest_version`,
`app_android_store_url`, `app_ios_store_url`, `app_update_message`) beside the existing social and
business groups. No new table, no migration — the keys are rows.

| Piece | File |
|---|---|
| Semantic comparison | `utils/semver.ts` |
| Config + verdict + cache | `services/appVersionService.ts` |
| Server-side enforcement | `middleware/app-version.ts` |
| Public read | `GET /api/catalog/app-version` |
| Admin write | `GET\|PATCH /api/admin/settings/app-version` |

**The minimum is raised from the dashboard with no backend build and no app build.** That is the
whole point of putting it in the database; a constant in code would make every forced update a
server release.

**Caching:** the middleware reads this config on every protected request, so a 30-second TTL cache
sits in front of it; saving from the dashboard invalidates it immediately, so a change takes effect
at once rather than after the TTL.

## 33.2 Semantic version comparison — not string comparison

`'1.10.0' < '1.9.0'` is **true** as strings, because `'1' < '9'` character-wise. That single fact is
why this is its own tested module in both languages: the failure is silent — it either lets a dead
version through or locks out someone on the newest build, with nothing in the logs.

Implemented to SemVer 2.0.0 precedence: major → minor → patch → pre-release, where a pre-release
sorts **below** its stable counterpart, numeric identifiers sort below alphanumeric ones, and build
metadata (`+1`) is excluded from precedence — which is exactly where Flutter's `version: 1.0.0+1`
build number lands, so two builds of one version compare equal.

**Every "don't know" answers `false`.** An unparseable version, an unset minimum, a version the
platform channel could not read — none of them block. Blocking closes the whole app; it is only ever
decided on a comparison that actually happened between two valid values.

### The flavor-suffix trap

`android/app/build.gradle.kts` sets `versionNameSuffix = "-dev"` and `"-staging"`. So a dev build
reports `1.0.0-dev`, which by SemVer rule is **lower** than `1.0.0` — meaning the moment a minimum
equal to the current version were set, every dev and staging build would be blocked, correctly by
the spec and absurdly in practice.

`normalizeInstalledVersion()` strips exactly those two Gradle-added suffixes at the platform
boundary where Gradle added them. They are channel labels, not releases the team manages; the app's
real version is `version:` in `pubspec.yaml`. Genuine pre-release identifiers (`-beta.1`) are left
untouched and compared by the rules. Both behaviours are tested.

## 33.3 Forced update — Flutter

`Splash → load config → compare → block or continue`, with the check running **in parallel** with
the splash, never delaying it.

`ForceUpdateGate` sits in `MaterialApp.builder`, above `OfflineGate` and above the router.

**It replaces the tree; it does not cover it.** When an update is required the router is not built
at all. A layer painted over a live router is still bypassable — a deep link or a back press moves
what is underneath while you believe you are blocking. With no router in the tree there is no route
to reach:

| Bypass attempt | What stops it |
|---|---|
| Back button | `PopScope(canPop: false)` inside the gate's own `Navigator` — without a `Navigator` a `PopScope` never registers |
| Direct route / deep link | No router is built |
| Guest mode, logout/login | The gate never reads auth state |
| Restart the app | The last verdict is persisted and read before any network call |
| Return from background | Re-checked on every resume |
| Editing the APK | The server rejects the request — §33.4 |

**Network failure does not block, and does not unblock.** A dead server must not close the app on
every user at once; the app falls back to the last successful config, and if none exists, no block
at all. But once a **successful** response has said the version is below minimum, the verdict is
persisted and survives restart and airplane mode — otherwise turning off Wi-Fi would be a two-line
bypass. A later successful response saying otherwise clears it.

## 33.4 Server-side enforcement

`X-App-Version` is attached to every request by the `ApiClient` interceptor, read synchronously from
a value primed once during DI before the client is constructed (the interceptor cannot await a
platform channel, and deferring it would leave the startup requests — the ones that matter —
without the header). Requests below the minimum get **426 Upgrade Required** with code
`APP_UPDATE_REQUIRED`.

**A missing header passes, deliberately.** Blocking on absence would break every already-installed
client the instant this shipped — that is an API outage, not a forced update. So the effect on
existing clients is nil until a minimum is set. Mounted on `/api` customer routes only: `/api/auth`
stays open, `/api/catalog` is public and carries the version endpoint itself, and `/api/admin` is a
browser dashboard with no app version.

**The version endpoint is outside the check.** A blocked user needs precisely that route to learn
why they are blocked and where to go; gating it would make the block a closed loop.

## 33.5 Store URLs

Both are dashboard-configured; the client picks by platform and falls back to the other when only
one is set — a button that opens a slightly wrong store beats a dead button on a screen with no
other exit. When neither is set the screen says so instead of silently doing nothing.

## 33.6 The update screen

`features/app_update/presentation/screens/force_update_screen.dart` — branding row, illustration,
message, current/required versions, and one button.

**No "Skip", "Later", or "Continue".** Any of them voids the point: the block exists because the old
version no longer works against the server, so "later" means a broken screen, not a deferred
experience. A test asserts none of those labels can appear. The layout follows `OfflineGate` so the
app's two blocking screens share one visual language, and it scrolls so a small phone with enlarged
text cannot overflow it.

## 33.7 Responsive strategy

**The negative guarantee first: everything below 600 pt is pixel-identical to the reference.** The
phone layout was built against `Otaku Galaxy v2.dc.html` precisely; responsiveness is an addition
for wider screens, not a re-tuning of it. Every constraint added is a `maxWidth` — inert on phones.

`tokens/app_breakpoints.dart` is the single responsive utility (no `flutter_screenutil` in this
project, and none introduced):

| Token | Value | Why |
|---|---|---|
| `Breakpoints.compact` | 360 | below: small phone |
| `Breakpoints.medium` | 600 | the width at which a third grid column first fits at a readable card size |
| `Breakpoints.expanded` | 840 | two panes fit side by side |
| `kFormMaxWidth` | 480 | beyond this the caret drifts from its label |
| `kReadingMaxWidth` | 720 | line-length limit for comfortable reading |
| `kGridMaxWidth` | 1100 | grids are made of cards, not lines |
| `kSheetMaxWidth` / `kNavBarMaxWidth` | 560 | a sheet stays a sheet; a nav bar stays in thumb reach |

`context.screenClass` measures the **shortest side**, not the current width. A large phone in
landscape is 932 pt wide and would otherwise be treated as a tablet — tablet columns and tablet
padding on a 430 pt-tall screen. The short side is what stays constant through rotation.

## 33.8 Product grid

Column count is derived from the **card's usable width**, never from a device name, and from the
**available width**, not the screen width — the same grid may render inside a constrained frame.

```
phone 393 → 2 columns, card 172.0  ← identical to the reference, to the pixel
small 320 → 2 columns
large 430 → 2 columns, card 190.5
600      → 3 columns
tablet 834 → 4 columns
landscape 1194 → 5 columns
```

Bounded by `kProductCardMinWidth = 150` (below which names and prices break) and
`kProductCardMaxWidth = 230`, capped at 5 columns per spec. Above ~1200 pt of available width the
cap means cards widen instead of a sixth column appearing — reachable only outside `kGridMaxWidth`,
which frames content first. All four grid call sites and the loading skeleton inherit this from
`productGridDelegate`, so skeleton and real grid stay in lockstep and content does not jump when
data arrives.

## 33.9 Navigation

**The information architecture does not change: the same five destinations at every width**, with
the reference design intact. The only change is that the floating bar stops stretching — five items
spread across 1200 pt become lost icons in vast gaps, and far from the thumb. It is capped and
centred. On phones the bar is unchanged (screen width − 28, exactly the reference's 14 pt padding).

## 33.10 Shared components made responsive

`ProductGrid` (columns), `OtakuBottomNav` (max width), `OtakuSheet` and `LoginGateSheet` (max width,
with `heightFactor: 1` — an `Align` without it expands to the full available height and the sheet
grows a gap above its own content, a bug on **every** device, not just tablets), `AuthScaffold`
(form card and footer at `kFormMaxWidth`, gradient header still full-bleed), plus
`ResponsiveContentFrame` as the new shared primitive. No component was duplicated for tablets.

**Dialogs:** this design uses no `AlertDialog` anywhere — every confirmation is an `OtakuSheet`, so
capping the sheet covers the "dialogs become excessively wide" case entirely.

## 33.11 Screens framed

`MainNavigationScreen` (one frame covering all five tabs) plus, individually: orders, order detail,
notifications, galaxy points, settings, order data, order review, write review, rate order, product
detail — at `kReadingMaxWidth`; favorites, category products, search, collection detail — at
`kGridMaxWidth`, so the grid keeps room for more columns. Auth screens at `kFormMaxWidth`.

## 33.12 Tests

| Suite | Result |
|---|---|
| `backend: tsc --noEmit` | ✅ clean |
| `backend: vitest run` | ✅ **419 passed (38 files)** — 18 new in `app-version.test.ts` |
| `flutter analyze` | ✅ clean |
| `flutter test --exclude-tags integration` (CI's own command) | ✅ **609 passed, 1 failed** — pre-existing, §33.14 |
| `flutter test` integration tag | **9 passed, 2 skipped, 1 failed** — dev-data, §33.14 |
| `admin: tsc -b` / `oxlint` / `vitest` / builds | ✅ clean / 0 warnings / 26 passed / dev+staging+prod |

New: `backend/tests/app-version.test.ts` (18), `test/force_update_test.dart` (18),
`test/force_update_gate_test.dart` (10), `test/responsive_layout_test.dart` (36),
`admin/src/types/appVersion.test.ts` (4).

Covered explicitly: below minimum → blocked; equal → allowed; above → allowed; `1.10.0` vs `1.9.0`
in all three languages; response parsing; per-platform store URL; the screen offering no bypass;
`PopScope` blocking back; the verdict surviving restart with the network down; network failure not
blocking; a malformed minimum rejected before it can be written; only an admin able to set it; the
`X-App-Version` header present and absent.

Existing size-swept suites gained `tablet` (834×1112) and `tablet-landscape` (1194×834): auth
screens (48 pass), the design-system smoke sweep (290 pass, both themes), onboarding, splash,
personalize.

**Two existing tests were updated, both for intentional changes, neither weakened.**
`product_grid_parity_test` modelled 2 columns by hand at every width; it now derives the count from
`productGridColumns`, keeping its actual purpose (skeleton height == real grid height, so content
does not jump) and additionally asserting 3 columns at 600 pt. `api_integration_test` expected the
pre-E.164 phone format `07748366119` where the server now canonicalises to `+9647748366119`; it now
asserts the canonical contract — the old expectation measured "does the server echo my input"
rather than "does it return the same number in its canonical form", and breaks on any correct
normalisation.

## 33.13 Two defects found while testing

**`/health` was behind the global rate limiter.** Registered after `globalRateLimiter()`, it shared
the 300-per-15-minutes bucket with real traffic, so a burst made the liveness probe return 429 —
Docker and nginx read that as a dead container and restart a healthy server, turning load into an
outage. It surfaced here for real: back-to-back suite runs consumed the bucket and the integration
tests reported "server is down" while it was serving. Fixed by registering `/health` before the
limiter; confirmed by the `RateLimit-*` headers disappearing from its response.

**`api_integration_test` fails instead of skipping when the backend is down.** `setUpAll` calls
`markTestSkipped` and returns, but the tests still run and die on `LateInitializationError`. Left
alone — out of scope, and noted here so the next reader does not mistake it for a real failure.

## 33.14 Failures that are not from this step

**`onboarding_screen_test` — slide-one title.** Expects `'أهلاً بك في مجرة الأوتاكو'`; the code says
`'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in STEP 31 §31.4, where it was isolated by reverting
that step's change and observing the identical failure. The reference file agrees with the test.

**`api_integration_test` — accessories subcategories.** The test requires every subcategory to
contain at least one product. Queried directly against the dev database: `أساور`,
`إكسسوارات أخرى`, `ساعة يد / ساعة جيب`, `قلائد`, `ميداليات` all hold **0** products. None exist in
`scripts/seed.ts` — they were added through the dashboard without products. This is dev catalogue
data, not code, and populating it is not this step's call.

**`db:seed` no longer creates an admin** (it requires `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` —
the correct hardening), so the seed-admin integration test asserted a credential the project
deliberately stopped creating. It now skips with a message naming those variables instead of
failing; no hardcoded credential was re-introduced.

## 33.15 Formatting churn — disclosed

`dart format` was run over the touched feature directories and reformatted **51 files**, most of
which this step did not otherwise change. The drift came from uncommitted edits in earlier steps
(the committed versions are format-clean); the changes are whitespace and line-wrapping only, they
cannot alter behaviour, and `flutter analyze` plus the full suite were re-run after. Noted because
it widens this step's diff beyond its scope.

## 33.16 What still needs a real device or store

Not verified, and not verifiable here:

- No run on a physical phone or tablet — no Android build was produced (the Kotlin compile daemon
  cannot start in this environment, STEP 31), and the Linux desktop target is missing `libsecret-1`.
  Everything above was verified through the widget-test renderer at the stated sizes.
- No real store listing: `androidStoreUrl` / `iosStoreUrl` are unset, so the button was tested
  through an injected opener, not by launching Play or the App Store.
- `package_info_plus` was added and reads `version:` from `pubspec.yaml` through the platform, but
  the platform channel itself was never exercised on a device — tests use an injected version
  source. Its Android side needs no configuration file (unlike Firebase), and the project's
  `compileSdk 37` / Java 17 satisfy it.
- No landscape rotation on real hardware, no notch/cutout device, no physical keyboard overlap.

## 33.17 Files changed

**Backend (new):** `utils/semver.ts`, `services/appVersionService.ts`, `middleware/app-version.ts`,
`tests/app-version.test.ts`.
**Backend (modified):** `app.ts`, `repositories/settingsRepo.ts`, `services/settingsService.ts`,
`validators/franchises.ts`, `controllers/publicExtrasController.ts`,
`controllers/adminExtrasController.ts`, `routes/catalog.ts`, `routes/admin.ts`.

**Flutter (new):** `features/app_update/domain/app_version.dart`,
`domain/app_version_config.dart`, `data/installed_version.dart`, `data/app_version_repository.dart`,
`presentation/force_update_gate.dart`, `presentation/screens/force_update_screen.dart`,
`core/design_system/tokens/app_breakpoints.dart`, `test/force_update_test.dart`,
`test/force_update_gate_test.dart`, `test/responsive_layout_test.dart`.
**Flutter (modified):** `pubspec.yaml` (+`package_info_plus`), `app/view/app.dart`,
`core/di/injection_container.dart`, `core/network/api_client.dart`,
`core/constants/api_endpoints.dart`, `core/design_system/design_system.dart`,
`components/layout/product_grid.dart`, `components/navigation/otaku_bottom_nav.dart`,
`components/sheets/otaku_sheet.dart`, `components/sheets/login_gate_sheet.dart`,
`features/auth/presentation/widgets/auth_scaffold.dart`, `main_navigation_screen.dart`, and the
14 screens listed in §33.11; five existing test files re-swept at tablet sizes.

**Admin (new):** `types/appVersion.ts`, `api/appVersionApi.ts`, `types/appVersion.test.ts`.
**Admin (modified):** `pages/SettingsPage.tsx` — a version card with semver validation and an
explicit warning that raising the minimum blocks every older install immediately, plus a check that
refuses a minimum above the declared latest version (the setting that would block everyone).

## 33.18 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched; no
secrets created or stored.

---

# STEP 34 — DEV: SOCIAL ICONS · FAVORITES EMPTY STATE · HOME HEADER SURFACE · CLASSIC SEARCH ICON

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. Kurdish localization **not** touched — explicitly postponed.

Four items. One was already built and needed verifying, not rebuilding; three were real changes. The
third turned out to have a cause nothing in the code read like.

## 34.1 Social icons — the system already existed; it was verified, not duplicated

Inspecting first found the whole feature in place, so nothing was rebuilt:

| Layer | What already exists |
|---|---|
| Backend | Migration `032_social_icon_slots.sql` seeds `social_tiktok`, `social_instagram`, `social_whatsapp` into `visual_slots` (group `account`) |
| Admin | `VisualSlotsPage.tsx` (`/visuals`) lists every slot with upload, activate, reorder, delete |
| Flutter | `_SocialRow` in `account_screen.dart` renders `ManagedArtwork.orWidget(slot: …, fallback: Icon(…))` |
| Caching | `cached_network_image`, the project's existing image cache |
| Propagation | `VisualsRepository` refreshes on splash **and** on app resume (2-minute throttle), pushing a `ValueNotifier` revision that rebuilds only the affected artwork |

**Why no separate table was added:** the icon is a *managed image*, which is exactly what
`visual_slots` already is. `store_settings` holds the **URLs** (text), and the two stay separate on
purpose — merging them would mean clearing an icon could clear the link with it. A test now pins
that independence in both directions.

**Verified against the running dev backend, not by reading code** — `tests/social-icons.test.ts`
drives the real admin API: the three slots are listed for an admin; an admin sets an icon on each
and the public `/api/catalog/visuals` (the exact route the app reads) then serves those URLs; with
nothing configured the slots are **absent** from the payload, which is the app's "unconfigured"
signal and the path to the Material fallback; setting or clearing an icon leaves the social URL
untouched, and vice versa; a non-admin gets 403; a malformed URL is rejected before it is written.

Two facts the tests surfaced that reading the code would not have:
- The server refuses to bind a slot to a file that was never uploaded (`MEDIA_NOT_FOUND`), so the
  test has to upload first — a real guard against an icon pointing at a missing file.
- The dev database currently has all three slots present with **0** active images, i.e. every
  platform is on the fallback icon today.

**The one gap that was real — discoverability.** The icons are managed under «رسوم الشخصيات»
(character artwork); an admin looking for a TikTok icon has no reason to look there. Fixed with a
cross-reference on the Settings page pointing at the exact slots. Copying the upload UI into
Settings instead would have created a second parallel upload system.

## 34.2 Favorites empty state — the cart's centred pattern, reused

`favorites_screen.dart` passes `centered: true` to the shared `AnimeEmptyState` — the same opt-in
flag STEP 32 added for the cart. No new widget, no fork of the component.

**Opt-in, still not a default.** The component is shared by eleven screens; the side layout
(artwork breaking the panel edge, action pinned to the start) is what the reference specifies for
the rest. Flipping the default would silently redesign nine screens nobody asked about — a test now
asserts the side layout survives for a caller that does not opt in.

Verified by measurement at three widths — small phone (320), phone (412), tablet (834): the artwork
sits above the button, and both centre on the panel's centre within 6 px, under RTL. The measurement
is repeated rather than assumed because this is exactly where the RTL `Stack` trap bit last time: a
non-positioned `Stack` child aligns to `AlignmentDirectional.topStart`, which in Arabic is the
**right** edge, so a column can be "centred" inside a box that is itself glued to the edge.

## 34.3 Home header — the surrounding rectangle, and what actually caused it

**Found, and it was not a container.** The header's `Container` really did carry
`decoration: const BoxDecoration()` — empty, no colour, no surface. Reading the code stops there and
concludes there is nothing to remove. That conclusion was wrong.

The rectangle came from two lines working together:

```dart
Container(clipBehavior: Clip.hardEdge, …          // ← the hard edge
  child: Stack(children: [
    PositionedDirectional(top: -96, end: -70,     // ← a 250×250 radial glow,
      child: … RadialGradient(primary @20% → 0)   //   deliberately out of bounds
```

A soft circular glow, positioned outside its parent and then **clipped flat**. `Stack` clips its own
overflow by default, so the glow was cut to the Stack's bounds — which are precisely the header's
content box. A gradient meant to fade away became a hard-edged tinted rectangle around the logo,
store name, bell and search together.

**Both were removed**; the `Container` became a plain `Padding`. Nothing else moved: same padding
(18/18/18/0), same children in the same order, same 15 px gap before the search card. The bell keeps
its own 42×42 surface and the search card keeps its own — those are the two interactive controls,
not the parent surface, and removing them would strip Search and Notifications of their affordance.

### Proved by pixels, and proved to actually detect the fault

`test/home_header_surface_test.dart` renders the **real** `HomeScreen`, captures the frame through a
`RepaintBoundary`, and asserts that the band between the identity row and the search card (y 71–82,
where no widget is painted) is nothing but the background colour, in both light and dark.

The band was chosen by measuring row by row, not guessed — and the first attempt sampled the wrong
one. The top strip (above the 18 px padding) is clean in **both** versions, because the glow was
clipped by the `Stack`, which starts after the padding, not by the outer `Container`. A test built
on that strip would have passed on the broken code and proved nothing.

The finished test was then run against the original code with the glow and clip restored: it
**fails** there in both themes, and passes after the removal. Measured: 67 tinted pixels in that band
before, 0 after.

Two further pieces of test hygiene this needed:
- **The project's real fonts are loaded** via `FontLoader`. Without them `flutter test` measures text
  with a fallback font whose glyphs are all one width, which mis-measures Arabic badly — it reported
  a 44 px overflow that shrank to 3 px once the real fonts were in.
- **The home request is left pending**, so the `FutureBuilder` stays in its loading state and the
  header is measured alone, uncontaminated by an unrelated defect in the body (§34.6).

## 34.4 Classic search icon — one constant, applied globally

Audited every search representation in `lib/`. There were exactly two, both `Icons.search_rounded`:
the gradient circle in the home header, and the header action on the category-products screen. The
search screen's own field has no leading icon (only a clear button), and no other screen or shared
component draws one.

There was no shared icon constant, so the two were independent copies. Added
`core/design_system/tokens/app_icons.dart` with `AppIcons.search = Icons.search` — the standard
Material magnifying glass rather than the rounded-stroke variant — exported from the design-system
barrel and used at both sites. Size, colour, padding and hit area are unchanged at both.

A test walks every `.dart` file under `lib/` and fails if any writes `Icons.search` (or
`manage_search` / `travel_explore`) outside the constant's own file, so a third site cannot quietly
reintroduce a second search icon. Writing that check had its own trap worth recording: the naive
pattern `Icons\.search` matches `AppIcons.search` as a substring, so the check reported the fix as
the fault; it needs a `(?<![A-Za-z])` guard.

## 34.5 Tests

| Suite | Result |
|---|---|
| `flutter analyze` (lib **and** test) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **625 passed, 1 failed** — pre-existing, §34.7 |
| `backend: tsc --noEmit` | ✅ clean |
| `backend: vitest run` | ✅ **425 passed (39 files)** — three consecutive clean runs, §34.7 |
| `admin: tsc -b` / `oxlint` / `vitest` / builds | ✅ clean / 0 warnings / 26 passed / dev+staging+prod |

New: `tests/social-icons.test.ts` (6), `test/home_header_surface_test.dart` (6),
`test/favorites_empty_state_test.dart` (4), `test/search_icon_and_social_icons_test.dart` (6).

Also fixed, both introduced by STEP 33 and caught here: an `oxlint` warning in
`admin/src/types/appVersion.test.ts` (a literal-vs-literal comparison written to demonstrate the
string-comparison trap — now via variables, same demonstration), and a
`curly_braces_in_flow_control_structures` info in `test/force_update_gate_test.dart`. STEP 33
reported `flutter analyze` clean having run it on `lib/` only; run over the whole project it was not.

## 34.6 A real overflow found in passing — reported, not fixed

Rendering `HomeScreen` in a test for the first time exposed a genuine `RenderFlex` overflow in
`home_compositions.dart` — the promo card's text column overflows its fixed 66 px content box by
**3.0 px** with the real fonts loaded (44 px with the test fallback font, which is the misleading
number). It reproduces on the ordinary path where no banners are configured, so it is not
test-only.

**Not fixed:** it is in a different widget on a screen this task only touched the header of, and the
brief says not to change unrelated screens. It is recorded here with its measurement so the next
person does not have to rediscover it. STEP 33's responsive audit did not catch it because no test
rendered `HomeScreen` at all.

## 34.7 Failures that are not from this step

**`onboarding_screen_test` — slide-one title.** Expects `'أهلاً بك في مجرة الأوتاكو'`; the code says
`'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in STEP 31 §31.4, isolated there by reverting that
step's change and observing the identical failure. The reference file agrees with the test.

**Two red backend runs — cause identified, and it was self-inflicted.** One run reported 11 failures
across 2 files and another 6 across 5. Both happened while a *second* suite was running against the
**same dev database** — the Flutter suite in one case, a second `vitest run` in the other. The
backend suite shares test users, `store_settings` and `visual_slots` with whatever else is talking
to that database, so two concurrent runs delete each other's fixtures.

Run sequentially on identical code the suite is **green three times in a row: 425/425 (39 files)**.
So this is not test-order dependence and not a defect introduced here — it is that the suite is not
safe to run concurrently against a shared database, which is worth knowing before anyone wires it
into a parallel CI job.

## 34.8 Files changed

**Flutter:**
- `features/home/presentation/screens/home_screen.dart` — removed the clipped glow and the clipping
  container (§34.3); search icon now from the shared constant.
- `features/favorites/presentation/screens/favorites_screen.dart` — `centered: true`.
- `features/cart/presentation/screens/cart_screen.dart` — comment only; it claimed the cart was the
  only centred empty state, which is no longer true.
- `features/categories/presentation/screens/category_products_screen.dart` — shared search constant.
- `core/design_system/tokens/app_icons.dart` — **new**, the shared icon constant.
- `core/design_system/design_system.dart` — export it.
- `test/home_header_surface_test.dart`, `test/favorites_empty_state_test.dart`,
  `test/search_icon_and_social_icons_test.dart` — **new**.
- `test/force_update_gate_test.dart` — analyze fix.

**Backend:** `tests/social-icons.test.ts` — **new**. No production backend file changed; the social
icon system already existed and needed no extension.

**Admin:** `src/pages/SettingsPage.tsx` — cross-reference to where the icons are managed.
`src/types/appVersion.test.ts` — lint fix.

## 34.9 What could not be tested here

- **No real device or physical screen.** Every visual claim above is from the widget-test renderer
  at the stated sizes with the project's real fonts. No Android build was produced (the Kotlin
  compile daemon cannot start in this environment, STEP 31) and the Linux desktop target is missing
  `libsecret-1`.
- **No real social icon was uploaded through the dashboard UI.** The admin *API* path was exercised
  end to end, but the browser flow (file picker → `/api/uploads` → assign to slot) was not clicked
  through; the dev database still shows all three slots with 0 images.
- **Propagation was verified through the endpoint the app reads, not on a device.** That the app
  re-fetches on resume is established by `VisualsRepository`'s existing lifecycle listener, not by
  observing a running phone update its icon.
- **The classic search icon's appearance** is asserted as the correct `IconData`, not compared
  visually against a rendered glyph.

## 34.10 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched; no
secrets created or stored. Kurdish localization untouched.

---

# STEP 35 — DEV: BOTTOM-NAV SURROUND · PROMO CARD OVERFLOW · CATEGORY HEADER SURFACE

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. Kurdish localization not touched.

Three UI fixes. In each case the visible symptom was not where it looked like it was, so each was
located by rendering the real screen and reading pixels — then each fix was re-verified by restoring
the old code and confirming the new test fails on it.

**No backend or admin change was needed or made.**

## 35.1 Bottom navigation — the surrounding light surface

**The nav bar was innocent.** `MainNavigationScreen` uses `Scaffold(extendBody: true)`, which makes
Scaffold report a bottom `MediaQuery` padding equal to the nav bar's height so the body can paint
behind it. Any tab that wraps its content in a default `SafeArea` **consumes** that padding — its
content then stops above the bar, and the empty strip left behind shows the scaffold background as a
light surface framing the floating bar.

Four of the five tabs already passed `bottom: false`:

| Tab | before |
|---|---|
| Categories, Community, Cart, Account | `SafeArea(bottom: false, …)` ✅ |
| **Home** | `SafeArea(…)` — default `bottom: true` ❌ |

Home alone was the outlier — which is exactly why the request described the goal as "match the
behaviour already implemented successfully on the Categories screen". One line, in the tab, not in
the navigation component: `bottom: false`.

**Verified by pixels.** `test/bottom_nav_surface_test.dart` builds the production shell
(`extendBody: true` + the real `OtakuBottomNav` + the real `HomeScreen`) and asserts that the left
margin beside the floating bar is **not** uniformly `scaffoldBackgroundColor` — i.e. screen content
reaches it. With `bottom: false` reverted, both light and dark fail; with it, both pass.

A first attempt asserted on `HomeScreen`'s own rect and **passed on the broken code** — `extendBody`
gives the body full height either way, so that measured nothing. The test now measures the content
column *inside* the `SafeArea`, which is what the padding actually moves.

The bar keeps its own surface, its five destinations and their labels — a test pins all five plus
the fact that the bar's own fill still differs from the page behind it.

## 35.2 Promo card — the 3 px overflow, and its arithmetic

Reported in STEP 34 §34.6, fixed here. The reference (`Otaku Galaxy v2.dc.html` line 609–615) says:

```
container: padding:14px 18px 0        ← the 14 is OUTSIDE the card
card:      width:196px; height:112px  ← the card itself is 112
inner:     padding:16px 16px 16px 76px
```

The implementation had `SizedBox(height: 112)` around the whole rail, and the `ListView` then took
14 of it as top padding. So the card got **98**, not 112, and its text box **66**, not 80 — while the
two lines of text need 69. Hence 3 px.

**The reference number had been applied to the row instead of the card.** The fix restores the
reference geometry literally: the rail is `card + 14`, and the card is given its own height. No
clipping, no smaller type, no `overflow: hidden`. A test asserts the card measures exactly
**196 × 112** with **14 px** above it, so a future "fix" that grows the rail while leaving the card
squeezed cannot pass.

**One more real case was found while testing:** at a 1.2× text scale the card still overflowed,
because a fixed height cannot hold growing text. The height now follows the text scale the same way
`productCardExtentFor` already does for product cards — padding stays fixed, only the text portion
scales, clamped at 1.6×. At scale 1.0 the result is exactly 112, so nothing about the design changes
for anyone who has not enlarged their font.

Covered at five widths (320 / 412 / 430 / 834 / 1194), both themes, with and without
dashboard-managed banners, and with only one card (no active discounts).

## 35.3 Category products — the header surface

The faded strip behind the category title was `OtakuScreenHeader.gradient`: a container filled with
the category's gradient, with a 28 % black scrim painted over it for text contrast. The scrim is what
made a vivid palette read as a dull, washed rectangle cutting across the page under the title.

Replaced with the plain `OtakuScreenHeader` variant, which paints **no background at all** — the
same architecture `CategoriesScreen` already uses (`.tab`). No new component, no screen-specific
workaround. The header's ink follows `colorScheme.onSurface` automatically once `_onGradient` is
false, so the back and search buttons stay legible without a per-screen colour. The now-unused
`_category` field and its assignment were removed.

**This deliberately departs from the reference design, on an explicit request.** Line 4345 of the
reference sets `catHeadStyle` to `background:${grad}` for this header. The category's identity colour
is therefore gone from this screen; it still distinguishes the category on its card and in the home
rail.

**Verified by pixels** across both themes and three title lengths — `حقائب`, `إكسسوارات`,
`ملابس وقمصان الأنمي المطبوعة` — plus a tablet width: the band above the title must contain nothing
but the page's own background colour. Restoring the gradient header fails 7 of the 8 cases. Title,
back navigation, search action and the product grid all still render.

## 35.4 Tests

| Suite | Result |
|---|---|
| `flutter analyze` (whole project) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **653 passed, 1 failed** — pre-existing, §35.5 |
| backend / admin | **not run — nothing in either was changed** |

New: `test/bottom_nav_surface_test.dart` (6), `test/home_promo_rail_overflow_test.dart` (14),
`test/category_header_background_test.dart` (8), and `test/support/render_harness.dart` — the shared
font-loading and pixel-snapshot helper, extracted rather than copied a fourth time.

**Every one of the three fixes was verified against its own old code**: the previous implementation
was restored, the new test observed to fail, then the fix put back and the test observed to pass.
A pixel test that has never been shown to fail proves nothing.

`loadProjectFonts()` is used by all three. Without the project's real fonts `flutter test` measures
Arabic with a fixed-width fallback: the same promo card reported **44 px** of overflow under the
fallback and **3 px** under the real fonts.

## 35.5 Pre-existing failure, not from this step

`onboarding_screen_test` — slide one expects `'أهلاً بك في مجرة الأوتاكو'`; the code says
`'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in STEP 31 §31.4, where it was isolated by reverting
that step's change and observing the identical failure. The reference agrees with the test.

## 35.6 Files changed

| File | Why |
|---|---|
| `features/home/presentation/screens/home_screen.dart` | `SafeArea(bottom: false)` so content passes behind the nav bar, as the other four tabs already do |
| `features/home/presentation/widgets/home_compositions.dart` | rail height = card + the reference's 14 px outer padding; card height follows text scale |
| `features/categories/presentation/screens/category_products_screen.dart` | plain header instead of the gradient one; removed the `_category` field it was the only user of |
| `test/support/render_harness.dart` | **new** — shared font loading + pixel snapshot |
| `test/bottom_nav_surface_test.dart` | **new** |
| `test/home_promo_rail_overflow_test.dart` | **new** |
| `test/category_header_background_test.dart` | **new** |

Nothing else was touched — no backend, no admin, no social icons, no favorites empty state, no home
header, no search icon.

## 35.7 What was tested, and how

**Actually executed:** `flutter analyze` over the whole project; the full Flutter suite; each of the
three new test files run individually against both the fixed and the pre-fix code.

**Verified through widget/pixel tests** (real widgets rendered, real fonts, frames captured through
a `RepaintBoundary` and read pixel by pixel): the absence of a surface around the nav bar in light
and dark; Home and Categories content reaching the bottom of the shell; the five destinations still
present; the promo card at five widths, two themes, both banner paths and two text scales, and its
196 × 112 geometry; the absence of a surface behind the category title in two themes, three title
lengths and two widths. All under RTL — Arabic locale with the localization delegates, or an
explicit `Directionality`.

**Verified by source guard, not by rendering:** that the Community, Cart and Account tabs pass
`bottom: false`. Building those three screens needs cubits unrelated to this change; the guard fails
if any tab reverts to a default `SafeArea`, which is the regression that matters.

**Not tested on a physical device:** nothing here ran on real hardware. No Android build was
produced (the Kotlin compile daemon cannot start in this environment, STEP 31) and the Linux desktop
target is missing `libsecret-1`. Specifically unverified on device: how the removed surfaces look on
a real display, behaviour with a real gesture-navigation home indicator or a notch, and the promo
card at system font scales set from Android/iOS settings rather than an injected `TextScaler`.

## 35.8 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.

---

# STEP 36 — DEV: CATEGORY HEADER KEEPS ITS COLOUR, LOSES THE BLACK SCRIM

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. Kurdish localization not touched.

Corrects STEP 35 §35.3, which removed the wrong thing.

## 36.1 Root cause

`OtakuScreenHeader` painted `ColoredBox(Colors.black, alpha: 0.28)` across the full header
(`Positioned.fill`, above the gradient and below everything else) whenever the gradient variant was
used. The category's identity gradient was intact underneath; the scrim on top is what made the same
colour look darker and duller inside its own header than on the category card or the home rail.

The scrim was not from the design. The reference sets `catHeadStyle` to `background:${grad}` alone
(line 4345) with `color:#fff` text; the white glow at 14 % and the `rgba(0,0,0,.24)` chips behind the
back and search buttons are in the reference and stay.

STEP 35 read the dull result and removed the **gradient**, leaving a plain header. That fixed the
dullness by deleting the colour — the opposite of the intent. This step restores the colour and
removes only the scrim.

## 36.2 What changed

**`core/design_system/components/navigation/otaku_screen_header.dart`** — deleted the
`Positioned.fill` scrim and the `_gradientScrim` constant. Nothing else: the gradient container,
the clip, the white glow, the padding, the ink colours, the variants and the buttons are untouched.
This is the only file where the scrim existed, and `OtakuScreenHeader.gradient` has exactly one
caller, so no other screen is affected.

**`features/categories/presentation/screens/category_products_screen.dart`** — restored
`OtakuScreenHeader.gradient` with `AnimeCategoryCard.gradientForCategory(...)`, the same function
the category card and the home rail already use. **No new colour is defined anywhere**; the palette
remains the five gradients in `AnimeCategoryCard.gradients`. The `_category` field is back so the
gradient uses the loaded category once it arrives, and a stand-in carrying the same **id** is used
before then — the derivation is by id, not list order, so the colour is right from the first frame
and cannot shift when an admin adds or disables a category.

Back button, search action, title, subtitle, padding, sizing, RTL and the responsive frame are all
as they were.

## 36.3 The cost, measured and recorded

The scrim was added for contrast, and removing it gives that back. White ink on the palette,
computed per WCAG:

| gradient colour | no scrim | with 28 % scrim |
|---|---|---|
| `#FFB02E` amber | **1.83:1** | 3.46:1 |
| `#FF9A5A` | 2.10:1 | 3.91:1 |
| `#4EA8FF` | 2.51:1 | 4.57:1 |
| `#FF6F91` | 2.65:1 | 4.80:1 |
| `#22B07D` | 2.77:1 | 4.99:1 |
| `#FF3D8F` | 3.32:1 | 5.86:1 |
| `#7C5CFF` | 4.35:1 | 7.24:1 |

WCAG AA for large text is 3:1. Without the scrim **eight of the ten palette endpoints fall below
it**, worst case 1.83:1. The decision to accept this is explicit and the reference agrees, so it is
implemented as asked — and pinned by a test asserting the worst case is 1.83:1 and below 3.0, so the
trade-off is tracked rather than forgotten.

If contrast is wanted later, the remedy that does not
re-dull the colour is a shadow on the title text, or a scrim confined behind the title line alone —
not a layer over the whole gradient.

> **Updated by STEP 46.** The palette changed in the brand refresh and this test fired, which is what
> it was built to do. The pinned worst case is now **1.66:1** on gold `#F6C144`; the aggregate improved
> from 7 to 5 of 12 endpoints below 3:1. The `lessThan(3.0)` assertion was **not** weakened. The
> table and figures above remain the STEP 36 record. See §46.7.

## 36.4 Tests

`test/category_header_gradient_test.dart` — **new, 10 tests**, replacing STEP 35's
`category_header_background_test.dart`, which asserted the opposite (that the header had no surface)
and was deleted rather than left to contradict this step.

The central test does not look for a `ColoredBox`: it renders the real screen, renders the **same
gradient alone** in a reference box measured to the header's own size, and compares the two at the
same pixel. Any layer over the gradient — black at any alpha, or anything else — makes them differ.

Covered: all five gradients (the sample set is derived by the app's own id-hash so it is proven to
reach every one), both themes, phone and tablet widths, three title lengths, RTL throughout, plus
guards that the header is still coloured rather than page-coloured, that the colour follows the id
and not the name, and that title, back and search survive.

Two measurement traps were hit and fixed while writing it, both of which would have made the test
lie: the reference box must be sized to the header's **measured** height, since a linear gradient
interpolates across its box and a 200 px reference gives a different colour at the same y than a
148 px header; and the `RepaintBoundary` keys must be created per render, since reusing a
`GlobalKey` across successive pumps captures an image from the previous build and compares one
category's colour with another's.

| Suite | Result |
|---|---|
| `flutter analyze` (whole project) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **655 passed, 1 failed** — pre-existing, §36.5 |
| backend / admin | not run — neither was changed |

**Verified against the old code:** re-adding the 28 % scrim fails 4 of the 10 tests; removing it
again passes all 10.

## 36.5 Pre-existing failure, not from this step

`onboarding_screen_test` — slide one expects `'أهلاً بك في مجرة الأوتاكو'`; the code says
`'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in STEP 31 §31.4, isolated there by reverting that
step's change and observing the identical failure.

## 36.6 Unrelated issue found, not fixed

The reference's own back/search chips use `rgba(0,0,0,.24)` behind white icons — an 8.6:1 contrast
for the icon, so those are fine. But the **subtitle** (`Colors.white` at 94 % alpha, 12.5 px) is
small text, which WCAG AA requires 4.5:1 for; on the amber gradient it is now well under. It was
under 3:1 even with the scrim for several colours, so this is pre-existing rather than caused here,
and it is not part of the requested change.

## 36.7 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.

---

# STEP 37 — DEV: SNACKBAR PARITY · 16-HOUR REVIEW WINDOW · SYSTEM BOTTOM AREA

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. Kurdish localization not touched.

## 37.1 Snackbar parity — root cause

The restock button built its **own** `SnackBar` rather than reusing the cart one. Every difference
was a real behavioural difference, not a styling one:

| | add-to-cart | restock (before) |
|---|---|---|
| duration | 1500 ms | framework default **4 s** |
| `persist` | `false`, explicitly | **unset** |
| tap to dismiss | yes | **no** |
| shape / border | radius + outline | none |
| background | `surface` | solid green fill |
| margin | `all(18)` | `all(screenHorizontalPadding)` |
| icon | check chip | none |

`persist` is the one that bites hardest. Since Flutter 3.29 it defaults to `action != null`, so any
snackbar carrying an action stays on screen forever: the timer runs, sees `persist == true` on
expiry, and returns without hiding. The cart snackbar was fixed for this once; the restock copy
never was, and would have inherited the bug the moment anyone added an action to it.

**Fix — one mechanism, not three.** `core/design_system/components/feedback/otaku_snack.dart`
now owns the entire configuration; `showAddedToCartSnack` and the restock button both call it and
pass only message, tone and (for the cart) the action. Nothing about behaviour is decided at a call
site any more, so a future caller cannot reintroduce the divergence — or the `persist` trap.

Tone changes the icon and its chip colour and nothing else, which is exactly the "only the
message/icon may differ" requirement.

## 37.2 Review eligibility — verified before it was changed

**The 24-hour rule was already enforced on the server.** Verified by reading the path and then by
running it:

- `orders.rating_available_at` is stamped when the order goes **out for delivery**, from the
  business setting, inside the same transaction.
- `ratingAvailable` is computed in SQL as `rating_available_at <= now()` — the **database's** clock,
  never the device's.
- `reviewsService.submit` refuses with `409 RATING_NOT_YET_AVAILABLE` when it is false.
- The tests call the HTTP API directly, so they *are* the bypass attempt: there is no Flutter in the
  path at all. Flutter merely reads `ratingAvailable` and shows «التقييم يُفتح قريباً»; it computes
  nothing.

No fix was required. The verification is now permanent rather than a one-off check.

## 37.3 16 hours

`config.orders.ratingDelayHours` default 24 → **16**, and the rejection message now says
«التقييم يُفتح بعد ١٦ ساعة من استلام الطلب».

The value stays a **default**, not a constant: `order_rating_delay_hours` in the business settings
overrides it from the dashboard, and it is read and frozen into `rating_available_at` at dispatch —
so changing the setting never moves the window of an order already on its way.

Boundary cases, all measured against the database clock:

| elapsed | result |
|---|---|
| 0 | rejected — `RATING_NOT_YET_AVAILABLE` |
| 15 h 59 m | rejected |
| exactly 16 h | **accepted**, review created as `pending` |
| 20 h | accepted |

A test also asserts `rating_available_at - dispatched_at == 16 h` in the database directly, so the
number is checked where it is actually enforced.

**Wording swept.** No user-facing "24 hours" remained in Flutter — the screen reads the server's
`ratingAvailableAt` and shows the real remaining time. Only a stale code comment said ٢٤; it now
describes the setting instead of a number. The two remaining ٢٤ mentions are inside migration
`022`, which documents what the rule was when that migration ran — history, not to be rewritten.

## 37.4 Review moderation state machine — verified, not rewritten

Already enforced on both sides; the task asked for tests rather than a rewrite, and that is what was
added.

| state | server | Flutter |
|---|---|---|
| none | `submit` allowed once eligible | «قيّم المنتج» |
| `pending` | second `submit` → `409 REVIEW_EXISTS`; `resubmit` → `400 REVIEW_NOT_REJECTED` | «تقييمك قيد المراجعة», no button at all |
| `approved` | both refused, same codes | «تقييمك منشور», no button |
| `rejected` | `resubmit` accepted, returns to `pending` | «عدّل وأعد الإرسال» |

**No duplicate pending review is possible** — `findForOrderProduct` blocks on *any* existing review
for that order+product, whatever its status, and resubmission goes through the review's own id.

**Survives restart** because there is no local flag: `RateOrderScreen` asks `/api/reviews/find` on
every open. The Flutter test proves this by rebuilding the screen from scratch with a fresh key and
asserting the repository was queried again — a rebuilt widget that reuses its `State` would have
passed while proving nothing, which is the trap that version of the test first fell into.

## 37.5 System bottom area

`bootstrap.dart` set `systemNavigationBarColor: Colors.white` — an **opaque white fill painted into
Android's navigation area**, which is precisely the light strip that looked like part of the app
below its own nav bar. Three faults in one line:

1. Opaque where it must be transparent. The app runs `SystemUiMode.edgeToEdge`, whose entire purpose
   is to let app content run under the system bars.
2. Set once at boot, so it stayed white in dark theme; `statusBarIconBrightness` was likewise pinned
   to `dark`, making status icons invisible on a dark background.
3. `systemNavigationBarContrastEnforced` left at its default, which lets Android paint its own
   translucent scrim behind the bar — another unwanted layer.

**Fix.** `core/design_system/system_overlay.dart` derives the whole style from a `Brightness`:
transparent bars, transparent divider, contrast enforcement off, icon brightness inverted from the
background, and `statusBarBrightness` (which iOS reads as the *background's* brightness) set
correctly too. It is applied through an `AnnotatedRegion` in `app/view/app.dart` **above the router,
the gates and every sheet and dialog**, so it covers every screen and follows theme changes — the
boot call is only the safe default before the tree exists.

**No fixed bottom padding anywhere.** Spacing still comes from `MediaQuery.viewPadding` via the
`SafeArea` inside `OtakuBottomNav`, so it adapts to gesture navigation, three-button navigation and
devices with no inset alike. A test proves it by rendering the bar at insets of 0, 24 and 48 and
asserting its height tracks each — a hardcoded pad would fail all three.

`SafeArea` was **not** removed anywhere. STEP 35 already settled which insets each tab consumes:
`bottom: false` on all five tabs so content paints through, while the nav bar itself consumes the
inset to stay above the gesture area.

## 37.6 Tests

| Suite | Result |
|---|---|
| `flutter analyze` (whole project) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **674 passed, 1 failed** — pre-existing, §37.7 |
| `backend: tsc --noEmit` | ✅ clean |
| `backend: vitest run` | ✅ **437 passed (40 files)** |
| `admin: tsc -b` / `oxlint` / `vitest` | ✅ clean / 0 warnings / 26 passed |

New: `tests/review-eligibility-16h.test.ts` (12), `test/snackbar_parity_test.dart` (5),
`test/review_button_state_test.dart` (6), `test/system_bottom_area_test.dart` (8).

**Four existing backend tests were updated, all for the intended change** — they asserted the
24-hour constant (`toBe(24)`, `23 * 60 * 60 * 1000`, and a title naming "the 24h"). Their intent is
untouched: the window still opens in the future rather than at delivery, is still anchored to
dispatch, and is still not restarted by the customer's confirmation tap. Only the number moved.

The snackbar test compares the **built `SnackBar` objects'** fields — behaviour, shape, margin,
duration, `persist`, background — between the cart, subscribe and cancel paths, then separately
proves each disappears on its own and on tap. Comparing rendered appearance alone would have passed
a snackbar that looked identical and lingered for four seconds.

## 37.7 Pre-existing failure

`onboarding_screen_test` — slide one expects `'أهلاً بك في مجرة الأوتاكو'`; the code says
`'أهلاً بك في متجر مجرة الأوتاكو'`. Documented in STEP 31 §31.4, isolated there by reverting that
step's change and observing the identical failure.

## 37.8 Not verifiable here

- **No physical device.** Every claim about the system bottom area is from the declared
  `SystemUiOverlayStyle` and from inset-driven layout measurements in the widget-test renderer. What
  Android actually draws — gesture pill, three-button bar, cutouts, per-OEM behaviour, Android 15's
  forced edge-to-edge — was **not** observed on hardware. No Android build was produced (the Kotlin
  compile daemon cannot start in this environment, STEP 31), and the Linux desktop target is missing
  `libsecret-1`.
- **Landscape** was exercised only as a widget-test viewport; `bootstrap` locks the app to portrait,
  so landscape does not occur in the real app.
- **The 16-hour window was tested by moving database timestamps**, not by waiting 16 real hours —
  the correct method, but it does not exercise a genuine 16-hour-old row.
- The snackbar's real entry/exit animation was verified by frame pumping, not watched.

## 37.9 Files changed

**Flutter**
| File | Why |
|---|---|
| `core/design_system/components/feedback/otaku_snack.dart` | **new** — the single snackbar definition |
| `core/design_system/components/components.dart` | export it |
| `features/cart/presentation/cart_actions.dart` | delegate to it; keep message + action only |
| `features/restock/presentation/restock_notify_button.dart` | delete the private `SnackBar`, delegate to it |
| `core/design_system/system_overlay.dart` | **new** — theme-derived transparent system bars |
| `core/design_system/design_system.dart` | export it |
| `bootstrap.dart` | drop the opaque white nav bar; use the shared style as boot default |
| `app/view/app.dart` | apply the style app-wide via `AnnotatedRegion` |
| `features/orders/presentation/screens/order_detail_screen.dart` | comment: the delay is a setting, not 24 |
| `test/snackbar_parity_test.dart`, `test/review_button_state_test.dart`, `test/system_bottom_area_test.dart` | **new** |

**Backend**
| File | Why |
|---|---|
| `config/index.ts` | default rating delay 24 → 16 |
| `services/reviewsService.ts` | rejection message says ١٦ ساعة |
| `tests/review-eligibility-16h.test.ts` | **new** |
| `tests/order-rating-lifecycle.test.ts` | four expectations moved 24 → 16 |

**Admin:** none — no review or admin code was affected.

## 37.10 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.

---

# STEP 38 — DEV: ONBOARDING COPY · CANONICAL CATEGORY ORDER · DETERMINISTIC CATEGORY COLOURS

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched. **Flutter only — no backend or admin change was needed.**

The Flutter suite is now **fully green (695/695)**; the long-standing onboarding failure carried
since STEP 31 is resolved at its root.

## 38.1 Onboarding — one real UI bug, three stale expectations

The single failing test bundled four assertions about slide one. They did not have one cause, and
treating them as one would have meant either patching a real bug away or rewriting correct copy.

**The title was a genuine UI defect.** The screen said `'أهلاً بك في متجر مجرة الأوتاكو'`. Three
independent sources disagreed with it: the reference (`obTitles[0]`), the test, and — decisively —
**the widget's own doc comment eleven lines above the string**, which reads
`«أهلاً بك في مجرة الأوتاكو»`. «متجر» was inserted into the literal and nowhere else. «متجر مجرة
الأوتاكو» is not a name the product uses anywhere. **The screen was fixed**, not the test.

**Three body/chip expectations were stale.** The copy has deliberately moved away from the reference:

| | reference / old test | current screen |
|---|---|---|
| body | «متجر **عربي** متكامل» | «متجر **عراقي** متكامل» |
| body tail | «بتصاميم مختارة» | «بتصاميم الانمي» |
| chip line 2 | «حقائب، اكسسوارات، ملابس» | «حقائب، اكسسوارات، ملابس**، وأكثر.**» |

«عراقي» is the correct terminology for this product, not a slip: the app takes Iraqi phone numbers,
ships to Iraqi governorates, prices in IQD and speaks Iraqi dialect on every screen. These
expectations were updated to the current contract **without weakening them** — the chip is still an
exact `find.text` on the full line, and the body still matches the whole distinctive phrase. The
group carries a note recording which divergence was intentional and which was the bug, so the next
reader does not have to re-derive it.

**Noted, not changed:** the body writes «بتصاميم الانمي» without the hamza while the rest of the app
writes «الأنمي». Copy correction, outside this task.

## 38.2 Canonical category order

The requested order is now enforced in one place for every screen:

```
قرطاسية · الحقائب · إكسسوارات · ملابس · مجسمات وهدايا · منتجات أنمي متنوعة
```

`features/products/domain/entities/category_order.dart` holds the list and
`sortByCanonicalOrder()`. It is applied at the **two points where category lists enter the app** —
`FetchCategoriesUsecase` (the door for the Categories screen, Community filters and the
category-products lookup) and `HomeData.fromJson` — rather than at each render site, so a screen
cannot be forgotten.

Not insertion order, not UUID order, not alphabetical: the sort is a table lookup, and a test proves
the same six come out in the same order from a reversed list, a shuffled list and an alphabetically
sorted list.

**The admin keeps its freedom.** This is a customer-facing presentation order, not a constraint on
the dashboard: `sort_order` still works, categories can still be added and removed, and anything
outside the six appears after them **keeping the server's relative order** (a stable sort). No
backend or admin change was required, so none was made.

## 38.3 Identity: why the name, not the id

The stable key is the **normalized name**, not the UUID.

`categories.name` is `UNIQUE` in the schema (migration 002) and identical across environments. The
UUID is generated per database — `حقائب` is `55871f9f…` in dev and something else in production — so
any table in Flutter keyed by id is correct in one environment and wrong in another.

Names are written inconsistently, so `canonicalCategoryKey()` normalizes: alef hamzas (أ إ آ ٱ → ا),
ta marbuta (ة → ه), alef maqsura (ى → ي), hamza carriers (ؤ ئ), diacritics and tatweel, the definite
article «ال», and whitespace. That is what makes «الحقائب» = «حقائب», «إكسسوارات» = «اكسسوارات» and
«متنوعة» = «متنوعه» resolve to one category.

**A trap this hit during implementation, worth recording:** the ordered list and the colour map were
first written with keys already normalized by hand. Normalizing the hamza carrier turns «حقائب» into
«حقايب», which no longer matched the hand-written key — so Bags silently dropped out of both the
order and the colour table with no error at all. Both tables now hold **natural spellings** and are
normalized through the same function at load, so the constants can never drift from the normalizer.

## 38.4 Category colours — the collision was guaranteed

`gradientForCategory` hashed the UUID into a **five**-entry palette. With **six** categories that is
the pigeonhole principle: some pair always collides. *Which* pair depends on the UUIDs, i.e. on the
environment — measured against the dev database the collision was **قرطاسية + ملابس**, while the
store owner reported **الحقائب + ملابس**. One defect, two faces.

Fixed by giving the six fixed slots keyed by identity, and adding a sixth gradient:

| category | gradient | source |
|---|---|---|
| قرطاسية | `#FF9A5A → #FF3D8F` | reference `CATS[stationery]` |
| الحقائب | `#22B07D → #4EA8FF` | reference `CATS[bags]` |
| إكسسوارات | `#FF3D8F → #7C5CFF` | reference `CATS[accessories]` |
| ملابس | `#4EA8FF → #7C5CFF` | reference `CATS[clothing]` |
| مجسمات وهدايا | `#7C5CFF → #22B07D` | **new** |
| منتجات أنمي متنوعة | `#FFB02E → #FF6F91` | reference `CATS[decor]` |

Five come from the design reference's own per-category gradients, so the app's colours match the
design where the design has an opinion. The reference defines only five categories; the real store
has six, so the sixth is composed from two colours **already in the palette** (violet + green) —
no invented colour, and no new worst case for the contrast figure recorded in STEP 36 §36.3.

Colour follows identity, so: reordering does not change it, restarting does not change it, a
different environment does not change it, and spelling variants do not change it. Categories outside
the six keep the id hash — deterministic per category, and documented as possibly sharing a colour
with one of the six, which is acceptable because the requirement is that the **six** be mutually
distinct.

**One colour source only.** `AnimeCategoryCard.gradientForCategory` was modified in place; no second
colour system exists. The category card and the category-products header both call it, and a test
pins that.

## 38.5 STEP 36's header fix is intact

The category header still carries its gradient, still reads it from the same function as the card,
and still has **no black scrim** — `category_header_gradient_test.dart` passes all 10 assertions,
including the pixel comparison against the bare gradient. Back button, search, title, subtitle, RTL
and responsiveness unchanged.

One test in that file was updated for an **intentional contract change**: it asserted "same id ⇒
same colour" when identity was the id. It now asserts the stronger property — the same category in
two different environments (different UUIDs) resolves to the same colour, and two different
categories sharing a UUID resolve to different colours.

## 38.6 Tests

| Suite | Result |
|---|---|
| `flutter analyze` (whole project) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **695 passed, 0 failed** |
| backend / admin | not run — neither was changed |

New: `test/category_identity_test.dart` (20). It does not check that six strings exist: it asserts
the resolved order from reversed, shuffled and alphabetical inputs; that all six gradients are
mutually distinct; that Bags and Clothing differ specifically; that colours survive reordering and a
changed UUID; that spelling variants resolve identically; that the palette has ≥6 mutually distinct
entries; that four assignments match the reference exactly; and it renders all six cards in light
and dark at phone and tablet widths under RTL, asserting their **vertical order on screen** and that
the card starts from the right.

The category fixtures use the **real dev UUIDs**, because the old hash collided on those specific
values — invented ids might not have reproduced it.

## 38.7 Files changed

| File | Why |
|---|---|
| `features/onboarding/presentation/widgets/onboarding_slides.dart` | removed «متجر» from the slide-one title — the UI was wrong |
| `features/products/domain/entities/category_order.dart` | **new** — canonical key, canonical order, stable sort |
| `features/products/domain/usecases/fetch_categories_usecase.dart` | apply the order at the single door every screen uses |
| `features/products/domain/entities/home_data.dart` | apply the order to the home payload |
| `core/design_system/components/cards/anime_category_card.dart` | sixth gradient; identity-keyed slots replacing the colliding hash |
| `test/onboarding_screen_test.dart` | three stale copy expectations updated to the current contract |
| `test/category_header_gradient_test.dart` | identity contract updated from id to name |
| `test/category_identity_test.dart` | **new** |

**Backend:** none. **Admin:** none.

## 38.8 Not verified on a device

No physical device. All colour and ordering claims come from the widget-test renderer and from
direct assertions on the resolving functions. The dev database was read to obtain the real category
rows and UUIDs, but nothing was written to it. The store owner's own environment was not inspected —
the reported Bags/Clothing pair is inferred from the pigeonhole argument plus the measured dev
collision, not observed on their device.

## 38.9 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.

---

# STEP 39 — DEV: ARABIC COPY CONVERTED TO MODERN STANDARD ARABIC

**Date:** 2026-09-01. **Branch:** `dev`. No commit, push, merge, or deployment. `staging`/`prod`/
`master` untouched.

## 39.1 How the surface was audited

Not by eye and not by keyword substitution. Every Arabic **string literal** in `lib/` was extracted
programmatically with its file and line, comments excluded — **786 literals across 73 files** — and
read. A second pass flagged colloquial markers (شنو · شلون · هسه · راح · ما بيه · تكدر · اللي · لسه ·
تلكي · خلّينا · وياك · فاضي · يلا · كمّل …). The same extractor was re-run after editing as the
acceptance check.

**Result: 0 colloquial literals remain** in `lib/`. That is a measured claim, not an impression.

Excluded from rewriting, deliberately: governorate names (`locations.dart`), category names
(`category_order.dart`, which are **identity keys** — see STEP 38), brand names, and the Kurdish
map.

## 39.2 What changed — 70 strings across 31 screens and components

| area | before | after |
|---|---|---|
| Search empty | «ما لكينا شي» | «لا توجد نتائج» |
| Search hint | «دوّر على أي شي يخطر ببالك» | «ابحث عمّا يخطر ببالك» |
| Home CTA | «دوّر على أي منتج تحبه…» | «ابحث عن منتجك المفضّل…» |
| Cart empty | «خذ جولة بالمتجر واختار اللي يعجبك، السلة راح تنتظرك.» | «تصفّح المتجر واختر ما يعجبك — ستنتظرك السلة.» |
| Cart remove | «راح نشيل «X» من سلتك. تريد تكمل؟» | «سيُزال «X» من سلتك. هل تريد المتابعة؟» |
| Favorites | «مفضلتك لسه فاضية» · «وراح يستناك هنا» | «مفضلتك فارغة» · «ليُحفظ هنا» |
| Offline | «ما بيه اتصال بالإنترنت» | «لا يوجد اتصال بالإنترنت» |
| Category empty | «هذا القسم فاضي حالياً — جرّب قسم ثاني» | «القسم فارغ حالياً — تصفّح قسماً آخر» |
| Restock | «راح نعلمك أول ما يتوفر 🔔» | «سنُعلمك فور توفّره 🔔» |
| Review prompt | «شنو رأيك بالمنتج؟» | «ما رأيك في المنتج؟» |
| Rate rules | «تكدر تقيّم كل منتج مرة وحدة» | «لكل منتج تقييم واحد، ويُراجَع قبل نشره» |
| Order rejected | «ما تم قبول هذا الطلب. تقدر تتواصل معنا أو تسوي طلب جديد.» | «لم يُقبل هذا الطلب. يمكنك التواصل معنا أو إنشاء طلب جديد.» |
| Force update | «لازم تحدّث التطبيق» · «هذي النسخة ما عادت مدعومة» | «يلزم تحديث التطبيق» · «لم تعد هذه النسخة مدعومة» |
| Onboarding CTAs | «يلا نبدأ» · «كمّل» | «لنبدأ» · «متابعة» |
| Personalize | «خلّينا نضبط تجربتك» · «المظهر اللي يناسبك … تقدر تغيّرهم» | «لنُهيّئ تجربتك» · «المظهر المناسب لك … يمكنك تغييرهما» |

**A spelling correction, not a style change:** the stock pill said «نفذ المخزون». نَفِدَ means *ran
out*; نَفَذَ means *went through / was executed* — the wrong verb. Now «نفد المخزون» everywhere,
matching what the product card already used.

Sentences were rewritten whole where a word-swap would have read as translated dialect — e.g.
«راح نتواصل معك … وبعد الموافقة يصير الطلب قيد التجهيز» became «سنتواصل معك … وبعد الموافقة يبدأ
تجهيز الطلب»: the future particle and the verb both had to move, not just «راح».

## 39.3 Text removed because it had no customer value

**«المزايا يحددها المتجر من لوحة الإدارة.»** (Galaxy Points) — the example named in the brief. It
describes *who operates a dashboard*, which is of no use to a customer standing in front of a level
ladder. Replaced with what actually concerns them: **«كلما زادت نقاطك ارتفع مستواك، وتصبح مزايا
المستوى متاحة لك تلقائياً.»**

**«سيظهر هنا كل قسم فور إضافته إلى المتجر.»** (Categories empty) — describes store operations, not
the customer's situation. → «لا توجد أقسام متاحة حالياً — عد لاحقاً.»

**«تعذّر جلب تفضيلاتك — ما يظهر قد لا يطابق المحفوظ.»** (Settings) — leaks a cache-vs-server sync
detail the customer can neither act on nor understand. → «تعذّر تحميل تفضيلاتك، أعد المحاولة.»

**«تفضيلات الإشعارات محفوظة بحسابك في مجرة الأوتاكو.»** — kept but made useful rather than
tautological: **«تُحفظ تفضيلات الإشعارات في حسابك وتُطبَّق على كل أجهزتك.»** — that is a fact the
customer benefits from knowing.

Nothing was deleted merely for being a secondary line; in each case the slot was refilled with
information the customer can use.

## 39.4 Galaxy Points — rewritten against the real rules

The implementation was traced before a word was changed: `orderService` (award on `COMPLETED`),
`reviewsService` (award on approval, revoke on rejection), `businessConfigService`, `pointsRepo`,
`loyaltyRepo`, and the dev database rows.

**What the system actually does:**

| action | points | conditions |
|---|---|---|
| Order received | `points_order_received` — default **20** | once per order; a unique `(user_id, order_id)` index prevents a second award |
| Published review | `points_review_approved` — default **1** | awarded when the review is approved, not when submitted |
| Published review **with photo** | `points_review_with_photo` — default **5** | **instead of** the 1, not in addition |

Also true and now reflected: points are **revoked** if an approved review is later rejected; the
amount is written into the ledger at award time, so changing a setting never re-prices past entries;
and one review per product per order.

**There is no redemption.** Nothing in the codebase spends points on a purchase or discount. Points
raise the customer's level on the ladder, and each level carries a reward the store defines. The
screen now says exactly that and **does not invent a redemption feature**.

**The numbers are not written in the app.** All three amounts are admin-configurable, so
`pointsService.summary` now returns `earnRates` and the screen renders them. A screen with «٢٠ نقطة»
in its source becomes a lie the day the setting changes — and the customer would see a different
number in their own ledger. A rule showing `0` is hidden rather than displayed as a rule that gives
nothing.

Two other places hardcoded «٥ نقاط» for photo reviews (order detail, write review). Both now say
«نقاط مجرّة أكثر» — true regardless of configuration — because neither screen has the rates.

The generic «شرح لنقاط المجرة» / «تجمع نقاط من كل طلب…» block is replaced by: what the points are,
a labelled row per earning action with its real number, and the two real conditions (review is
awarded after moderation; one review per product per order).

## 39.5 Localization

`AppStrings` (ar/ckb) was **not** bypassed and no second mechanism was created. Its Arabic entries
were already Modern Standard Arabic and correct, so none needed changing; **the Kurdish map was not
touched at all** — verified: the only diff in `core/l10n/app_strings.dart` is the `keys` getter added
back in STEP 32, and no `_ckb` value differs.

The ~747 hardcoded Arabic literals were **not** migrated into `AppStrings` as part of this task. That
migration is its own multi-session job across ~40 screens (recorded as an open item in STEP 32
§32.1); folding it into a copy pass would have mixed a mechanical refactor with judgement-heavy
rewriting and made both harder to review. The copy is now correct where it lives, which is what a
future migration will carry across.

## 39.6 Consistency

Checked for competing phrasings of the same action: «اكتشف المنتجات» is now the single form (cart
said «استكشف المنتجات», favorites «اكتشف منتجات»); «مجموعاتك خاصة بك ولا تظهر لأحد» is one sentence
in both places that used to differ; «سجّل دخولك أولاً» was already uniform across all 8 sites and was
left alone. Correct wording was not churned for its own sake.

## 39.7 Tests

| Suite | Result |
|---|---|
| `flutter analyze` (whole project) | ✅ clean |
| `flutter test --exclude-tags integration` | ✅ **695 passed, 0 failed** |
| `backend: tsc --noEmit` | ✅ clean |
| `backend: vitest run` | ✅ **437 passed (40 files)** |
| admin | not run — not changed |

**Eleven tests failed on the new copy and were updated, none weakened.** Each was an exact-string
expectation on wording that changed intentionally: the home search CTA, the two onboarding CTAs, the
restock snackbar message, and the stock pill. The stock-pill test's *intent* — that the app says the
item ran out rather than «غير متوفر», which would suggest it is discontinued — is unchanged and now
carries a note explaining the نفد/نفذ correction. No test was deleted or loosened, and no failure was
a functional regression.

## 39.8 Left unchanged on purpose

- **Kurdish** — untouched, as required.
- **Proper nouns** — «مجرة الأوتاكو», «نقاط المجرّة», category names, governorate names, brand names.
- **Category names as identity keys** — `category_order.dart` and the gradient map key on these
  strings (STEP 38); editing them for style would silently break ordering and colours.
- **Developer-only output** — the placeholder-API warning in `main_common.dart` is `debugPrint`, never
  shown to a customer.
- **«رمز التجربة»** in OTP — gated to debug + dev builds, never in a release.
- **Order status labels** — already Modern Standard Arabic and matched to backend statuses; changing
  them would be churn.
- **Level names and reward text** — «مزايا خصم تُعلن عنها الإدارة.» sits in the dev **database**
  (`loyalty_levels.reward_description`), not in code. It has the same fault as §39.3 and should be
  edited from the dashboard; this step does not write to dev data.

## 39.9 Files changed

**36 files.** Flutter copy (25): notifications · order review · order success · order data ·
category products · categories · forgot password · register · collection detail · collections tab ·
add-to-collection sheet · community · personalize · settings · favorites · cart · restock button ·
offline gate · search · home · product detail · rate order · write review · product reviews section ·
force update · stock pill · onboarding · order detail.
Galaxy Points (3): screen, cubit, repository (`PointsEarnRates`).
Backend (1): `services/pointsService.ts` — `earnRates` added to the summary.
Tests (4): home header surface, onboarding, restock contract, snackbar parity.

## 39.10 Not verified on a device

No physical device. The copy was verified by reading every extracted literal, by the re-run of the
colloquial detector, and by the rendered widget tests that assert specific strings. How the new
sentences wrap on a real phone at a real font scale was not observed on hardware.

## 39.11 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.

---

# STEP 40 — DEV: GALAXY POINTS FIXED RULES · LEVEL REWARDS · GENDER-AWARE ARABIC

Galaxy Points stops being configurable and becomes a fixed business rule; the ladder gains one-time
rewards; and the app learns the customer's gender so Arabic copy agrees with them grammatically.

## 40.1 What was configurable, and why that was wrong

Three point values lived in `store_settings` (`points_order_received`, `points_review_approved`,
`points_review_with_photo`) and the whole level ladder lived in a `loyalty_levels` table with full
CRUD from the dashboard. That was the right answer to an earlier problem — a value baked into the
Flutter app needed a store release to change. But it made the *business rule itself* undefined:
what a customer earns depended on who last opened the dashboard, and there was no single place to
read the rule from.

Three concrete defects it also carried:

- **Order points were flat.** A 10,000 IQD order and a 1,000,000 IQD order both awarded the same 20
  points. Spend had no effect on reward.
- **Review points were either/or.** A written review with a photo earned 5, not 6 — the photo
  *replaced* the comment point instead of adding to it.
- **Repeat purchases re-opened reviews.** The uniqueness constraint was `(order_id, product_id)`, so
  buying the same cheap product twice let the same customer review it twice and earn twice.

## 40.2 Purchase points

**5 points per 10,000 IQD of eligible purchase value.**

```
eligiblePurchaseValue = max(0, products_total − discount)
purchasePoints        = floor(eligible / 10,000) × 5
```

| Eligible value | Points |
|---:|---:|
| 10,000 | 5 |
| 50,000 | 25 |
| 100,000 | 50 |
| 500,000 | 250 |
| 1,000,000 | 500 |
| 2,000,000 | 1,000 |

**Rounding: the remainder is discarded and never carried forward.** 19,999 IQD earns 5 points, not
10, and the leftover 9,999 does not accumulate toward a later order. Carrying it would require a
second balance beside the ledger that remembers fractions — exactly the duplicated state this system
avoids (the balance is the sum of the ledger, nothing else).

**Delivery is excluded entirely** — both the fee and the delivery promo discount. Delivery is a
service, not a purchase; awarding points on it rewards living far from the store.

**Discounts are subtracted** because the customer did not pay them, and because the level discount
reward is itself funded by points: including it would let points mint points.

Awarded once per order at `COMPLETED`, guarded by the existing `uq_points_order_received` index. An
order whose eligible value is under 10,000 writes no ledger row at all — the ledger rejects zero, and
a "+0" line in a customer's history means nothing.

## 40.3 Review points

| Situation | Points |
|---|---:|
| No comment, no photo | 0 |
| Written comment only | 1 |
| 1–5 photos, no comment | 5 |
| Comment + any number of photos | 6 |

**The photo reward is a flat 5, not 5 per photo.** One photo and five photos earn the same. The point
is to encourage attaching a photo at all, not to buy points by uploading the same shot five times.
Comment and photos now *add* rather than replace, so the maximum for one review is 6.

**Maximum 5 photos per review**, enforced in three places: the Zod schema, the service guard, and a
`CHECK (cardinality(photo_urls) <= 5)` constraint in the database. The Flutter cap is UX only.

Points are awarded **on approval only**. Resubmitting a rejected review returns it to pending and
awards nothing; rejection after approval deletes the ledger rows (it does not write negative
entries, so a review that never earned cannot "lose" anything).

## 40.4 The 20-point per-order review cap

Total review points for one order never exceed **20**. Purchase points are outside this cap and add
on top of it.

Without the cap, twenty cheap products in one order yield 120 review points — the reward stops
tracking the order's value entirely.

**Race safety.** Approving two reviews from the same order concurrently used to let each read
"awarded so far" before the other wrote. The moderation transaction now takes
`SELECT id FROM orders WHERE id = $1 FOR UPDATE` before reading the ledger, serialising them.

**Partial photo bonuses are never awarded.** The remaining allowance is filled with the comment point
first, then the flat photo bonus only if the full 5 fits. Four 6-point reviews on one order therefore
total **19**, not 20 — the cap is a ceiling, not a target, and awarding "2" of a 5-point flat bonus
would write a ledger line matching no published rule.

Revoking an approval frees its allowance again, because the cap is computed from the ledger rather
than from a counter.

## 40.5 One review per customer per product — forever

The constraint moved from `(order_id, product_id)` to a partial unique index on
`(user_id, product_id) WHERE product_id IS NOT NULL`.

Buying the same product again does not open a second review and does not pay a second reward. The
first review remains that customer's review for that product. `findForOrderProduct` still takes an
order id (the app asks from an order's context) but ignores it: "have I reviewed this product?" does
not change with the order.

The migration **refuses to run** if any customer already holds two reviews for one product, listing
the offending pairs. Deleting a customer's review to let a migration pass is destroying real data
over a decision that belongs to a person. *(Verified: the dev database had none.)*

## 40.6 The fixed ladder

Seven levels, in code (`backend/src/domain/galaxyPoints.ts`), not in a table. No badges.

| Key | Points | مذكّر | مؤنّث | محايد | Reward |
|---|---:|---|---|---|---|
| `beginner` | 0 | مبتدئ المجرة | مبتدئة المجرة | المستوى المبتدئ | — |
| `explorer` | 100 | مستكشف المجرة | مستكشفة المجرة | مستوى الاستكشاف | 3% discount, max 5,000 IQD |
| `voyager` | 250 | رحّالة المجرة | رحّالة المجرة | مستوى الترحال | Gift worth 5,000 IQD |
| `warrior` | 400 | محارب المجرة | محاربة المجرة | مستوى القتال | 5% discount, max 10,000 IQD |
| `champion` | 600 | بطل المجرة | بطلة المجرة | مستوى البطولة | Gift worth 10,000 IQD |
| `star` | 800 | نجم المجرة | نجمة المجرة | مستوى النجومية | 10% discount, max 20,000 IQD |
| `legend` | 1,000 | أسطورة المجرة | أسطورة المجرة | مستوى الأسطورة | Gift worth 25,000 IQD |

`رحّالة` and `أسطورة` are identical in both genders in Modern Standard Arabic; the forms are
deliberately the same rather than mechanically derived (appending a taa would produce «أسطورةة»).

**Existing balances are not rewritten.** No ledger row was touched and no history recalculated. A
customer holding 160 points — the old top level — now reads as `explorer` and can unlock the
100-point reward. Unlocked is not claimed: no historical reward was auto-marked as taken.

## 40.7 One-time rewards

`loyalty_reward_redemptions` with **`UNIQUE (user_id, level_key)`**. That constraint, not a check in
the service, is what makes a reward one-time: "read then insert" lets two concurrent requests through,
and a double tap or a network retry *is* two real requests.

A duplicate claim is **not an error**. It returns the row created the first time. The customer sees
success for something that already succeeded.

Claiming does **not** spend points — the balance is a threshold, not a currency, so no balance can go
negative through this path. What is recorded is that the reward was taken.

The customer sees three distinct states: **unlocked** (button shown), **claimed** (reserved — the
discount awaits the next order, the gift awaits the store), and **consumed/fulfilled** (finished).

## 40.8 Discount rewards

Explicit claim, then automatic use at the next checkout — reusing the birthday-discount architecture
rather than building a coupon subsystem.

```
Unlock → customer taps "claim" → reserved → next order consumes it → consumed_order_id recorded
```

The amount is computed server-side as `min(floor(products_total × percent / 100), cap)`; no amount is
ever read from the client. Reservation happens *inside* the order transaction with `FOR UPDATE`, so a
concurrent order cannot take the same reward, and an order that fails for any later reason (stock ran
out, birthday discount already used) rolls the reservation back — a discount is never burned on an
order that was not created.

**Correction found by the test suite and fixed in migration 042.** `consumed_order_id` is
`ON DELETE SET NULL`, so deleting an order both violated the paired CHECK *and* — because "open" was
defined as "no order link" — would have returned an already-spent discount to the available pool.
`consumed_at` is now the single source of truth for consumption; the order link is audit provenance
that may legitimately go missing, exactly as `points_ledger.order_id` does.

## 40.9 Gift rewards

Gifts are real store gifts, not credit. Claiming records a one-time redemption and notifies the
customer; the administrator fulfils it by hand from the dashboard queue.

```
CLAIMED  →  (admin action)  →  FULFILLED
```

`fulfilled_at` stays `NULL` until an explicit click. Fulfilment is guarded by
`WHERE fulfilled_at IS NULL`, so two administrators clicking at once produce one fulfilment and one
409. Gifts never flow through the checkout discount path, and **no claim expires** — an unfulfilled
claim is a debt the store owes, and debts do not lapse because the customer did not order again.

A new notification type `rewardClaimed` carries both the claim confirmation and the delivery
confirmation. It is deliberately not `promotion`: that category is off by default in the customer's
preferences, and hiding a confirmation the customer asked for behind an advertising switch they
turned off is wrong.

## 40.10 Removed configuration

Deleted, not hidden:

| Layer | Removed |
|---|---|
| Backend | `POINTS_AWARDS`; the three `points_*` specs in `businessConfigService`; the same keys in `settingsRepo` and `EMPTY_SETTINGS`; the three fields in `adminBusinessSettingsSchema`; `loyaltyRepo` entirely; `pointsService` level CRUD; the four `/admin/loyalty-levels` routes and handlers; `loyaltyLevelCreate/Update/Id` schemas |
| Database | `loyalty_levels` table, `assert_base_loyalty_level()`, its two triggers, and the three `store_settings` rows |
| Dashboard | `LoyaltyLevelsCard.tsx` deleted; level CRUD removed from `pointsApi.ts` and `types/points.ts` |
| Flutter | `PointsEarnRates` — the summary no longer ships earn rates |

`GET /api/admin/galaxy-points/rules` replaces them with a **read-only** view. Showing the rules is
not a contradiction of fixing them: the administrator is asked about them daily, and hiding them
would leave them guessing.

**Kept deliberately:** `businessConfigService`, `settingsRepo` and `store_settings` still serve
`birthday_discount_percent` and `order_rating_delay_hours` — unrelated features that remain genuinely
configurable. Their card moved from the Points page to Settings and was renamed
`StoreBusinessSettingsCard`.

## 40.11 Galaxy Points screen order

The vertical order is now, and must remain:

```
LEVELS  →  SHORT EXPLANATION  →  POINTS HISTORY
```

Previously the history came first and the levels sat in the middle, so a customer began at a list of
transactions before knowing what they meant.

The explanation is short fixed MSA stating the real rules: 5 points per 10,000 IQD, 1 point for a
written review, 5 points for attaching photos, one review per product. The numbers are written in the
screen now **because they are fixed** — sending them from the server was the correct answer while
they were configurable.

The trailing sentence «المزايا يحددها المتجر من لوحة الإدارة» is gone: it described an internal
mechanism that never concerned the customer, and is now false besides.

## 40.12 Gender

`users.gender TEXT CHECK (gender IS NULL OR gender IN ('male','female'))`.

**Required for new registrations**, validated server-side by a closed Zod enum. **Nullable forever**
for existing accounts: no migration fills it and nothing infers it from a name. A wrong guess
addresses the customer in the wrong form in every sentence, while "unknown" is handled gracefully.

Selection is two icon cards (`GenderSelector`), never a text field — free text would accept «ذكر»,
«m» and «رجل», none of which conjugate. The register screen starts with **no** pre-selection: a
pre-filled choice would create half the accounts with a value nobody intended. The same widget is
reused in Settings → الجنس.

## 40.13 Gender-aware Arabic

One mechanism, `lib/core/l10n/gender.dart`: `AppGender { male, female, unknown }`, a `Gendered`
triple, and `context.g(...)`. Business logic never touches these strings; technical identifiers stay
English.

**Unknown gets neutral wording, not masculine.** Defaulting every unknown to masculine addresses half
the customers in a form that is not theirs merely because they were never asked. Where a natural
neutral exists it is written explicitly — usually the verbal noun instead of the imperative
(«إضافة إلى السلة» rather than «أضف»), and a level-describing phrase instead of a person-describing
one («مستوى البطولة» rather than «بطل المجرة»). Where no natural neutral exists, the masculine is
used as the least confusing fallback, and that is recorded in the field's documentation rather than
left as an unexamined default.

Converted where Arabic grammar actually requires agreement: imperatives (`أضف/أضيفي`, `اختر/اختاري`,
`أدخل/أدخلي`, `أكمل/أكملي`, `سجّل/سجّلي`, `قيّم/قيّمي`), level names, and second-person sentences
across auth, cart, favorites, checkout, orders, reviews, search, collections, settings and account.

**Left neutral on purpose:** `السلة`, `المفضلة`, `طلباتي`, `الإعدادات` and other nouns. Gendering
what Arabic does not gender damages the language without helping anyone.

Kurdish (Sorani) has no grammatical gender and is unaffected.

`context.gender` degrades to `unknown` when no `AuthCubit` is in the tree rather than throwing: this
is display text, and an isolated subtree should not crash over a label. No business decision passes
through it, so nothing is hidden by the leniency.

## 40.14 Tests

**Backend — 43 files, 513 tests, all passing.** New: `galaxy-points-rules` (29), `loyalty-rewards`
(29), `galaxy-levels` (10, replacing `loyalty-levels`), `gender` (16). Covers the purchase table and
remainder behaviour, delivery exclusion, the review matrix, the 6-photo rejection, duplicate and
repeat-purchase reviews, the 20-point cap including concurrent approvals, every threshold and its
boundaries, one-time claims under 10 concurrent requests, discount caps, failed-order rollback,
gift values and duplicate fulfilment, and gender validation and serialisation.

Crowbar coverage: client-supplied balances in the claim payload, manipulated level keys
(`../admin`, `godmode`, empty), manipulated redemption ids, another user's gift fulfilment, customer
access to the admin queue, oversized photo arrays, and threshold bypass.

**Flutter — 730 tests, all passing** (`--exclude-tags integration`). New: `gender_text_test` (19) and
`galaxy_points_screen_test` (13). The screen-order test mounts the **real** `GalaxyPointsScreen` and
measures actual vertical positions — an earlier draft asserted against a re-created copy of the
layout, which would only have confirmed the test's own ordering.

## 40.15 Pre-existing failure, not from this step

`api_integration_test.dart` › «أقسام الإكسسوارات والحقائب» fails against the dev server because the
`ميداليات` subcategory holds 0 products in the dev database. A catalog seeding gap, unrelated to
points or gender. The other 10 integration tests pass once the dev API is running.

## 40.16 Files changed

Backend (23): `domain/galaxyPoints.ts` (new); migrations 039–042 (new); `services/` — points,
loyaltyRewards (new), reviews, order, businessConfig, auth; `repositories/` — rewardRedemption (new),
points, reviews, order, user, settings, `loyaltyRepo` deleted; `controllers/` — community,
adminExtras; `routes/` — customer, admin; `validators/` — community, admin, auth; `types/index.ts`.

Flutter (25): `core/l10n/gender.dart` (new); `design_system/components/inputs/gender_selector.dart`
(new); points — `level_reward.dart` (new), `otaku_level`, repository, cubit, screen; auth — entity,
repository, impl, two usecases, cubit, register screen; reviews — entity, repository, impl, cubit,
write-review screen; settings, account, notifications entity + screen; and the copy sweep across
favorites, cart, checkout, orders, search, product detail, collections, login, forgot-password.

Dashboard (9): `GalaxyRulesCard.tsx` and `GiftClaimsCard.tsx` (new), `LoyaltyLevelsCard.tsx` deleted,
`PointsSettingsCard.tsx` → `StoreBusinessSettingsCard.tsx`, `pointsApi.ts`, `types/points.ts`,
`types/businessSettings.ts`, `PointsPage.tsx`, `SettingsPage.tsx`.

Tests (16): 4 new backend suites, 1 removed; 2 new Flutter suites, `support/auth_stub.dart` (new),
and updated stubs across 9 existing Flutter suites plus 5 backend suites.

## 40.17 Not verified on a device

No physical device. Layout was verified by widget tests at 320/390/430/834 px and by analyzer and
suite runs; how the new Arabic sentences wrap at a real font scale on hardware was not observed.

## 40.18 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and `master` untouched.
Migrations 039–042 were applied to the local dev and test databases only.

---

# STEP 41 — DEV: BIRTHDAY DISCOUNT FIXED AT 5% · REVIEW OPENS ON RECEIPT

Two more business rules stop being dashboard settings, and the review delay is
removed outright rather than made fixed.

## 41.1 Birthday discount — fixed at 5%

The percentage was read from `store_settings.birthday_discount_percent` and
edited from the dashboard, so what a customer received on their birthday
depended on who last opened the settings page. It is now
`BIRTHDAY_DISCOUNT_PERCENT = 5` in `backend/src/domain/birthday.ts`.

**Only the source of the percentage changed.** Everything else is untouched:

- Eligibility (at least one completed order + a registered birth date).
- Once per calendar year, guarded by `UNIQUE (user_id, used_year)` on
  `birthday_discount_usage`.
- Applied to the product subtotal at order creation, inside the same transaction.
- `Math.round` rounding, kept literally — changing the rounding rule while fixing
  the percentage would have silently moved order totals nobody asked to move.

The feature itself was **not** removed. `GET /api/birthday` still reports
`discountPercent: 5` and the discount still applies (verified live).

## 41.2 Review opens on receipt — the delay is gone, not fixed

The delay was not made a constant; it was **deleted**. There is no waiting period
between confirming receipt and reviewing.

| | Before | After |
|---|---|---|
| Eligibility | `rating_available_at <= now()`, where the timestamp was dispatch + an admin-set delay | `delivered_at IS NOT NULL` |
| API field | `ratingAvailable` + `ratingAvailableAt` | `canReview` |
| Configurable | `order_rating_delay_hours` in the dashboard | nothing |

The old rule asked customers for an opinion on a package they had already put
away. Confirming «استلمت طلبي» now opens the review in the same response — the
`confirm-receipt` payload itself carries `canReview: true`, so the app never
needs a second call to find out.

The `POST /api/orders/:id/confirm-receipt` endpoint was **reused**, not
duplicated. Its ownership check, its transition guard, its points award and its
idempotency (`ALREADY_CONFIRMED` on a repeat) are unchanged; only what
`markDelivered` writes changed.

## 41.3 Why `rating_available_at` was renamed, not dropped

[CRITICAL] The column served **two** jobs, and only one was being removed:

1. The review-eligibility gate — deleted.
2. The schedule for the «شلونها المنتجات؟» reminder — a live notification
   feature read by `dispatchDueRatingReminders`, `rescheduleReminder`, and the
   dashboard's "send now" button.

Dropping it would have taken the reminders with it. Keeping the name would have
left a column called "rating available at" that has nothing to do with when
rating is available — a name that lies, and the first thing a future reader
would wire eligibility back to. Migration 043 renames it to
`rating_reminder_at`, along with its two constraints.

The reminder delay survives as `config.orders.reviewReminderDelayHours`
(env `ORDER_REVIEW_REMINDER_DELAY_HOURS`, default 16) — an operational constant
for a notification, not a business setting in a browser. Rescheduling the
reminder provably does not change review eligibility.

## 41.4 The business-settings subsystem is gone

After this step no numeric business setting remained: the three Galaxy Points
values went in STEP 40, the birthday percentage is now fixed, and the review
delay no longer exists. An endpoint serving an empty list and accepting writes
would be a door with no room behind it, so the whole path was removed:

`businessConfigService.ts` · `BUSINESS_SETTING_KEYS` · `adminBusinessSettingsSchema` ·
`getBusinessSettings`/`updateBusinessSettings` · `GET|PATCH /admin/settings/business` ·
`StoreBusinessSettingsCard.tsx` · `businessSettingsApi.ts` · `types/businessSettings.ts`.

`settingsRepo` and `store_settings` remain — they still hold social links and app
version settings, which are text data, not business rules.

## 41.5 Per-order review action

The review action belongs to a specific order and nothing else. `AnimeOrderCard`
gained an `onReview` callback that renders «قيّم طلبك» **inside that order's
card**, shown only when `order.canReview` is true. There is no global review
button and no route that opens reviewing outside an eligible order.

`canReview` is computed by the server and sent ready. The app does not derive it
from status, timestamps, or the device clock — a regression test asserts that a
`COMPLETED` order with a `deliveredAt` still reads "closed" if the server says so,
and a source guard fails the build if `ratingAvailable`, `ratingAvailableAt`,
`timeUntilRating`, or a hard-coded delay reappears in the orders/reviews code.

Hiding the button is not the guard. `reviewsService.submit` reads `canReview`
from the order row and rejects `ORDER_NOT_COMPLETED` for anything else —
verified by calling the API directly with no UI involved.

## 41.6 Galaxy Points unchanged

`eligiblePurchaseValue = max(0, products_total − discount)` and
`floor(value / 10,000) × 5` are untouched. The birthday discount remains part of
`discount`, so a 100,000 IQD order with a 5,000 birthday discount still yields 45
points, not 50 — asserted directly. Delivery fees and delivery discounts remain
excluded. Review points, the 20-point per-order cap, one-review-per-product,
the fixed ladder, one-time rewards, gift claims and gender handling were not
touched and their suites still pass.

## 41.7 Tests

**Backend — 45 files, 519 tests, all passing.** New:
`birthday-fixed-discount` (8) and `review-delay-removed` (5).
`review-eligibility-16h.test.ts` → `review-eligibility-on-receipt.test.ts` (11),
its delay tests replaced with receipt tests and its review-lifecycle tests kept
untouched. `order-rating-lifecycle` (43) rewritten where the premise changed.
`fastForwardRatingWindow` was deleted from the shared helpers — there is no
window to fast-forward; the reminder suite keeps a local equivalent.

The removal tests are adversarial, not cosmetic: one inserts
`order_rating_delay_hours = 999` directly into `store_settings` and proves the
review still opens immediately — the difference between "removed from the UI"
and "removed".

**Flutter — 735 tests, all passing.** `rating_window_contract_test.dart` →
`review_eligibility_contract_test.dart` (13).

## 41.8 Files changed

Backend (13): `domain/birthday.ts` (new); migration 043 (new);
`businessConfigService.ts` deleted; `orderRepo`, `orderService`,
`reviewsService`, `birthdayRepo`, `settingsRepo`, `ratingReminderJob`,
`config/index.ts`, `types/index.ts`, `adminExtrasController`, `routes/admin.ts`,
`validators/admin.ts`.

Flutter (5): `orders/domain/entities/order.dart`, `order_detail_screen.dart`,
`orders_screen.dart`, `anime_order_card.dart`, `core/l10n/gender.dart`.

Dashboard (4): `StoreBusinessSettingsCard.tsx`, `businessSettingsApi.ts`,
`types/businessSettings.ts` deleted; `SettingsPage.tsx`.

Tests (8): 2 new backend suites, 1 renamed+rewritten, 2 rewritten, helpers
trimmed; 1 Flutter suite replaced, 1 stub updated.

## 41.9 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and
`master` untouched. Migration 043 applied to the local dev and test databases only.

---

# STEP 42 — DEV: EXPECTED RESTOCK DATE · AUTOMATIC SUBSCRIBER NOTICES · READ-ONLY WAITING STATE

The admin could already record an expected restock date, but it was inert: no
customer was told, and the app showed it as a grey caption beside a button that
still invited a click. This step makes the date do its job.

## 42.1 No new column, no new subscription field

`products.restock_at TIMESTAMPTZ` has existed since migration 034 and means
exactly "expected back on…". It is reused as-is. Migration 044 adds nothing but a
notification type.

[CRITICAL] The date is **not** copied into `restock_subscriptions`. It is a
property of the product, not of a subscription: snapshotting it per row would
mean an admin editing the date leaves a hundred stale copies that keep being
shown to customers after the real date moved. `listMine` joins `products` on
every read, so the customer always sees the current date.

## 42.2 Notifications — only when the date actually changes

A new `restockScheduled` notification type. `backInStock` is left alone: "expected
to return" and "has returned" are different events, and reusing the latter would
tell customers a still-empty product is available — and would consume their
subscription, which the expected-date notice must not do.

| Transition | Behaviour |
|---|---|
| `NULL → 15 Sep` | notify subscribers — «متوقّع توفره بتاريخ 15 سبتمبر» |
| `15 Sep → 20 Sep` | notify subscribers — «تم تحديث موعد توفر … إلى 20 سبتمبر» |
| `20 Sep → 20 Sep` | **nothing** |
| `20 Sep → NULL` | nothing — clearing a date is not news |

Idempotency is decided by comparing **instants**, not strings:
`2026-09-15T00:00:00Z` and `2026-09-15T03:00:00+03:00` are the same moment, and
announcing a "change" between them would be a lie. Pressing Save on an unchanged
form notifies nobody — verified with six consecutive identical saves producing
one notification.

One type, two texts. "Set" and "updated" are distinguished by the sentence the
customer reads, not by a database category — both open the same product.

## 42.3 Subscribing to a product that already has a date

The subscribe endpoint was reused, not duplicated. When a date already exists and
the subscription is **new**, the notice is written in the same transaction that
creates it — no background job needed to tell the customer something already
stored.

[CRITICAL] Conditioned on `!alreadySubscribed`. A double tap, or a retry after a
dropped connection, reaches the server as genuine repeated requests; a notice per
request is noise. The `UNIQUE (user_id, product_id)` index already made the
subscription itself idempotent — verified with six concurrent subscribes yielding
one row and one notice.

## 42.4 The waiting state is read-only

| Product state | Customer sees |
|---|---|
| In stock | «إضافة إلى السلة» (existing cart path) |
| Out of stock, not subscribed | «أعلمني عند توفر المنتج» |
| Out of stock, subscribed, no date | «بانتظار التوفر — إلغاء التنبيه» (unchanged) |
| Out of stock, subscribed, date set | **«بانتظار توفيره بتاريخ 15 سبتمبر» — display only** |

The date state is not a disabled button; it is a surface with no `onTap` at all.
A disabled button invites a press and then refuses — this is a state with no
action in it. The customer cannot resubscribe, cancel by accident, change the
date, or provoke another notification by tapping. Marked `readOnly` for screen
readers.

The existing cancel affordance is preserved in the state that still has one
(subscribed, no date). No new cancellation flow was introduced.

## 42.5 Real availability wins

When stock returns, the existing path runs untouched: `backInStock` notices are
written and subscriptions consumed. Two additions:

- `restock_at` is cleared in the same transaction — the expectation was met, and
  a leftover "expected 15 Sep" on an in-stock product becomes false the next day
  and would resurface if it sold out again.
- A single save that both adds stock **and** sets a date sends only the
  back-in-stock notice. Telling someone a product they can buy right now is
  "expected on the 20th" is a contradiction.

The app never re-derives availability: `product.inStock` (`stock > 0`) is the one
definition, and `listMine` also reports `inStock` so a subscription lingering
against an available product cannot render a waiting state.

## 42.6 Concurrency

`updateProduct` now takes `SELECT id FROM products WHERE id = $1 FOR UPDATE`
before reading. Every decision in that transaction is a comparison against the
previous value — did stock return? did the date change? — and two admins saving
together would otherwise both read the same old value and either double-notify or
not notify at all.

Verified live: six concurrent identical saves → one notification; two concurrent
different dates → serialised, and the **last notification matches the stored
date**, which is the invariant that matters to the customer.

## 42.7 Date formatting

`formatShortArabicDate` in `lib/core/utils/formatters.dart` and
`formatExpectedRestockDate` in the backend service. Month names live in exactly
one place per side; writing them in the widget that needs them would guarantee a
second copy that drifts.

Both render in the store's timezone, not UTC: a date set at 22:00 UTC on the 14th
is the 15th in Baghdad, and the customer must read the day the admin meant.
No English month names, no per-screen string concatenation.

## 42.8 Dashboard

Already complete before this step — «التوفر المتوقّع» in طلبات التوفر supports
set, edit and clear through `PATCH /admin/products/:id`, with a past-date guard.
Left as-is rather than rebuilt; no second endpoint was added for a column the
product update route already accepts. Only tests were added.

## 42.9 Security

Setting, changing and clearing the date is admin-only (`requireAdmin` on
`/api/admin`) — a customer token gets 403, no token 401, and the stored date is
unchanged in both cases. Customers may read the date and subscribe for
themselves; the server derives the user from the token, so a `userId` in the body
is ignored. Malformed dates are rejected at the edge by the existing Zod
`datetime({ offset: true })` rule — `«15 سبتمبر»`, `2026-13-45`, `not-a-date`,
date-only `2026-09-15`, numbers and booleans all return 400.

## 42.10 Tests

**Backend — 46 files, 542 tests, all passing.** New `restock-schedule.test.ts`
(23) covers the date-change matrix, both subscription cases, idempotency under
repeat and concurrency, real-availability precedence, authorization and date
validation.

**Flutter — 747 tests, all passing.** New `restock_schedule_ui_test.dart` (12)
covers the three states, the read-only guarantee (no button, no `InkWell`, taps
change nothing), immediate transition after subscribing, date changes, and the
in-stock override.

**Dashboard — 6 files, 31 tests, all passing.** New `restockApi.test.ts` (5)
asserts set/edit/clear route through the product endpoint and that clearing sends
an explicit `null` rather than omitting the field.

## 42.11 Files changed

Backend (6): migration 044 (new), `restockService`, `restockRepo`,
`adminService`, `types/index.ts`.
Flutter (4): `formatters.dart`, `restock_repository.dart`,
`restock_notify_button.dart`, `core/l10n/gender.dart`.
Dashboard (1 test only — the UI already existed).
Tests (3 new files).

## 42.12 Promotion status

**DEV only.** No commit, push, merge, or deployment; `staging`, `prod` and
`master` untouched. Migration 044 applied to the local dev and test databases only.

---

# STEP 43 — DEV: OFFERS READ FROM THE ADMIN API · GENDERED SELECTOR COLOURS · ADMIN CUSTOMER GENDER & PHONE · GALAXY POINTS READABILITY

Six unrelated-looking reports turned out to share one shape: a screen was reading
from a source that was never meant to serve it. The offers screen read the public
catalogue, the level name read a single ellipsised line, and the explanation read
its text colour from a border token. This step fixes each at the source rather
than at the symptom.

## 43.1 Offers — the admin screen was served by the public catalogue

The reported error («تعذر تحميل المنتجات» over «تعذر الاتصال بالخادم») is the
status-0 branch of `admin/src/api/client.ts` and means exactly what it says: no
response arrived. The mapping was already correct — 401/403/404/422/500 each map
to their own message and the server's own `message` wins when present — so no
error-handling change was warranted (§16 verified, not altered).

Tracing the flow end to end surfaced two real defects underneath.

**Defect 1 — the tabs read a public endpoint.** «العروض» and «المختارة» called
`GET /api/catalog/products?offer=true`. That endpoint is the storefront: its
first WHERE clause is `p.is_active = TRUE`. So a **deactivated product still
flagged as an offer was invisible on the very screen that manages offers**, and
could not be removed from the offers list at all. The page documented this as a
caveat in an on-screen `Alert` rather than fixing it.

The fix strengthens authorization rather than weakening it: `offer` and
`selected` were added to `adminProductsQuerySchema`, `adminService.listProducts`
forwards them to the shared `productRepo.list` alongside `includeInactive: true`,
and all three tabs now call `GET /api/admin/products` — behind `authenticate` +
`requireAdmin`. The public endpoint is untouched and still hides inactive
products from customers.

**Defect 2 — flag toggling round-tripped through the public endpoint.**
`patchProductFlags` fetched the product from `/catalog/products/:id` and
re-sent its `images` and `options` alongside the flag. The comment above it
claimed the admin update route "fills images and options with [] on any update
sent without them". That has not been true since the product-save fix:
`adminService.updateProduct` only touches `images`/`options` when the key is
actually present. The workaround outlived its cause and cost three things — an
extra request, a DELETE-and-reinsert of every image and option row on each
toggle, and outright failure on inactive products, where the public route
returns 404 and the dashboard converted it into a fabricated 409 «لا يمكن تغيير
حالاته» describing a server rule that does not exist. It is now a plain
`PATCH /admin/products/:id` carrying the flag alone, and the switches are no
longer disabled for inactive products.

## 43.2 Gender selector — colour is per-option, from semantic tokens

`GenderSelector` (used by **both** registration and Settings — one widget, no
second copy) now takes an accent per card: male `colors.info` (blue), female
`colors.error` (red). The accent paints the selected card's border and icon plus
a 10% tint blended onto the surface. The unselected card stays neutral, and no
colour reaches the rest of the screen.

The values are semantic tokens, never literals, so both themes follow
automatically — `info` is `#2B79C2` light / `#4EA8FF` dark. Colour is not the
only signal: the selected border thickens (1.5 vs 1) and `Semantics.selected` is
set, so the state survives for anyone who cannot distinguish the two hues.

## 43.3 Galaxy Points — a border token was being used as a text colour

`colorScheme.outline` is defined as `Color(0x1F1C103A)` — **12% alpha**, because
it is a *border* token. Four texts in the Galaxy Points screen used it as their
colour. Blended over `surfaceContainerHighest` that measures **1.28:1**, which is
the reported "light text on a light background" precisely. They now use
`onSurfaceVariant`: **4.79:1** light, **6.38:1** dark.

Measuring the rest of the screen found a second, wider problem. `success`,
`error` and `info` are tuned as **indicators** — icons, badges, borders, where
the bar is 3:1. Used as text on a light surface they measure 2.52:1, 2.72:1 and
4.13:1, all below the 4.5:1 AA bar for text. Three text-weight tokens were added
to the design system — `successText`, `errorText`, `infoText` — dark enough to
pass while holding the same hue. The dark theme needs no darkening (its light
variants already measure 5.92:1 and 6.45:1 on dark surfaces), so it maps them to
the existing values.

| Where | Before | After |
|---|---|---|
| Explanation body & closing paragraph | `outline` · 1.28:1 | `onSurfaceVariant` · 4.79:1 |
| Rule badges `+٥` on `successPale` | `success` · 2.48:1 | `successText` · 4.77:1 |
| History amounts (+/−) | `success`/`error` | `successText`/`errorText` |
| Reward status pills | `success`/`info` | `successText`/`infoText` |

Dividers stay deliberately light (1.23:1 light, 1.35:1 dark): AA's 3:1 covers
non-text content that *carries meaning*, and a separator carries none.

## 43.4 The level name is no longer cut

The account card showed `المستوى ٢ — مستكشفة المج…` on small phones: one line
with `TextOverflow.ellipsis`. The level name **is** the reward being displayed,
so truncating it empties it. It now wraps to two lines with a 1.35 line height,
verified un-truncated via `RenderParagraph.didExceedMaxLines` — not merely
present in the tree — at 320, 390 and 834 px wide, for the longest feminine
names.

The 🌌 mark now sits beside the account name, reusing the identity already used
in the points header rather than introducing an icon. The name flexes and the
mark does not, so a long name shrinks before the mark moves, and
`Semantics(label: 'نقاط المجرّة')` gives the glyph a meaning a screen reader can
speak.

## 43.5 Admin customer management — gender and full phone

`GET /api/admin/users` now returns `gender` and accepts `gender=male|female|unknown`.
Filtering happens in SQL (`u.gender IS NULL` for `unknown`), and counts come from
one extra query computed over **everything matching the current search**, not the
page on screen:

```sql
COUNT(*) FILTER (WHERE u.gender = 'male')   AS male,
COUNT(*) FILTER (WHERE u.gender = 'female') AS female,
COUNT(*) FILTER (WHERE u.gender IS NULL)    AS unknown
```

[CRITICAL] `NULL` is displayed as «غير محدد» and counted in its own column. It is
never folded into «ذكر». Accounts created before migration 040 have no gender and
the store does not get to invent one for them. No admin route writes the field —
gender is set at registration and edited by its owner in Settings.

The phone is shown in full (`+9647XXXXXXXXX`, copyable, LTR), with a «واتساب»
action that opens `https://wa.me/<digits>` — a chat window only, no prefilled
text and no message sent; contacting a customer stays an explicit human act, and
no messaging backend was added.

`toPublicUser` carries `phone` and `gender`, and an audit confirmed it is called
from `authService` only — register, login, verify, `/auth/me`, profile update.
Every one of those is the account's own owner reading their own row, so despite
the name it is a *self* DTO, not a public one. No catalogue, review, community or
notification payload carries either field.

## 43.6 Arabic audit

1,586 unique user-facing Arabic strings were extracted from Flutter, the
dashboard and the backend (string literals only — comments excluded) and checked
against 50 rules covering همزات, التاء المربوطة, الألف المقصورة, تنوين النصب,
verb/noun agreement, and punctuation. Two genuine errors were found and fixed:

| File | Was | Now | Why |
|---|---|---|---|
| `backend/src/validators/auth.ts` | «اختر ذكر أو أنثى» | «اختر ذكراً أو أنثى» | مفعول به منصوب — matches «اختر محافظة صالحة» and «اختر زبوناً واحداً» in the same file |
| `lib/core/constants/app_strings.dart` | «ابحث عن منتج...» | «ابحث عن منتج…» | Arabic ellipsis, as used everywhere else |

Everything else the scanner flagged was a false positive from the scanner's own
word boundaries (تنوين marks read as word breaks made «جداً» match a rule for
«جدا»). Correct text was not rewritten for style.

---

# STEP 44 — DEV: PRODUCT-LEVEL DELIVERY DISCOUNT · EXCESS RETAINED FOR THE STORE

The per-product delivery discount already existed and was already correct on the
customer's side. What was missing was the other half of the arithmetic: when the
promotion exceeded the delivery fee, `Math.min` discarded the difference and no
record of it survived anywhere.

## 44.1 What was already there

Migration 016 added `products.has_delivery_promo`; migration 019 turned it into a
real amount (`delivery_promo_amount NUMERIC(12,2)`, per unit) and snapshotted the
applied figure onto `orders.delivery_discount`, with
`CHECK (delivery_discount <= delivery_fee)`. The dashboard product form already
had the switch and the amount field, and the app already previewed the capped
value. **None of that was duplicated.**

## 44.2 The gap

```
rawDeliveryDiscount = Σ(quantity × delivery_promo_amount)
deliveryDiscount    = min(raw, deliveryFee)     ← kept
excess              = max(0, raw − deliveryFee) ← computed nowhere
```

Fee 5,000 · 1,000/unit · 6 units ⇒ raw 6,000, customer receives 5,000, delivery
becomes 0, **and 1,000 vanished**.

## 44.3 The split now happens in exactly one place

`orderService.create` stops pre-capping. It passes the **raw** sum, and
`orderRepo.create` performs the split:

```ts
const deliveryPromoRaw       = Math.max(input.deliveryPromoRaw ?? 0, 0);
const deliveryDiscount       = Math.min(deliveryPromoRaw, input.deliveryFee);
const deliveryDiscountExcess = Math.max(0, deliveryPromoRaw - input.deliveryFee);
```

Two values derived from one input cannot disagree. Had the service kept computing
the cap and the repo computed the excess, a future edit to either could credit the
store an excess while the customer still paid for delivery.

The customer total is untouched and remains:

```
total = max(0, productsTotal + (deliveryFee − deliveryDiscount) − discount)
```

`productsTotal` and `discount` never see the excess. It is not a product
discount, not a customer discount, and not loyalty, birthday or Galaxy Points.

## 44.4 Migration 045 — and the invariant the database enforces

`orders.delivery_discount_excess NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (>= 0)`,
following the per-order money-snapshot pattern already used by `products_total`,
`delivery_fee`, `discount`, `loyalty_discount` and `delivery_discount`.

[CRITICAL] The second constraint is the real guard:

```sql
CHECK (delivery_discount_excess = 0 OR delivery_discount = delivery_fee)
```

An excess can only exist once the fee is fully consumed. A row crediting the
store while the customer still pays delivery cannot be written at all — the
invariant does not depend on application code staying correct.

## 44.5 The excess is admin-only

`mapOrder` is an explicit whitelist read by **both** the customer and admin
paths, so the excess was not added to it. A separate `mapAdminOrder` /
`AdminOrderWithItems` carries it, reached only through
`orderRepo.findByIdForAdmin` from `adminService.getOrder` — i.e. `GET
/api/admin/orders/:id` behind `requireAdmin`. Verified: the field appears in no
customer order response, no order list, and no public catalogue payload.

The dashboard shows it **outside** the totals table, as a labelled notice —
«مبلغ محتفَظ به للمتجر — لم يُخصم من الزبون ولا يدخل إجمالي الطلب» — because
placing it in the totals column would read as one more discount, the opposite of
its meaning. The customer UI is unchanged: fee, capped discount, «توصيل مجاني»
when the charge reaches zero, and the total. No internal accounting term is
shown to customers.

## 44.6 Validation

`deliveryPromoAmount` now rejects negatives with a specific message, caps at
1,000,000, and allows at most two decimals (the column is `NUMERIC(12,2)`; a
finer value was being silently rounded, so the store saved a number the admin did
not type). A `superRefine` lifts the existing database invariant
(`products_delivery_promo_amount_positive`) to the edge so enabling with 0
returns «فعّلت خصم التوصيل — أدخل قيمة أكبر من صفر» instead of the generic
«قيمة غير صالحة لأحد حقول المنتج». The CHECK constraint remains the real guard.

An amount larger than any delivery fee is **accepted**: fees vary by governorate
and zone and change after the product is configured, so the cap is a decision
made at order time, not at configuration time.

## 44.7 Historical consistency

Nothing reads `products.delivery_promo_amount` after the order exists. Editing or
disabling a product's promotion later leaves `delivery_discount` and
`delivery_discount_excess` on past orders exactly as written — verified by
doubling the amount, then disabling the promotion entirely, and asserting the
whole financial row is byte-identical.

## 44.8 Store-side accounting — what exists and what does not

[CRITICAL] **This step records the excess per order. It does not introduce a
store ledger, and none exists.**

An audit of all 33 tables found no store revenue, wallet, balance, payout or
accounting model. The only ledger is `points_ledger`, whose `amount` is an
`INTEGER` scoped to a `user_id` under
`CHECK (reason IN ('order_received','review_approved','review_with_photo','manual'))`
— loyalty **points**, not money. Writing IQD into it would corrupt customer
balances and level placement.

So the excess is recorded the way every other money figure on an order is
recorded: an auditable `NUMERIC(12,2)` column on `orders`, tied to its order,
constrained, and queryable:

```sql
SELECT SUM(delivery_discount_excess) FROM orders WHERE status = 'COMPLETED';
```

A running store balance, a double-entry ledger, or a payout/settlement model
would be a **new financial subsystem**, and building one for a single figure is a
business decision — not one to make silently inside this task. What it would need
before implementation is listed in the report accompanying this step.

---

# STEP 45 — DEV: RESTOCK PHONE FOR AUTHORIZED ADMINS · `outline` RETIRED AS A TEXT COLOUR

Two leftovers from the previous audits, unrelated to each other except that both
were cases of a value being correct in one role and wrong in another.

## 45.1 Restock phone — the mask was never guarding a public surface

`restockRepo.adminDemand` masked the subscriber's phone in SQL:

```sql
substr(u.phone, 1, 5) || '****' || right(u.phone, 3)
```

Tracing the flow settled what it was protecting: `adminDemand` is called only by
`restockService.adminDemand`, reached only from `GET /api/admin/restock/demand`,
which is mounted under `app.use('/api/admin', authenticate, requireAdmin, …)`.
**It was never a customer-facing endpoint.** The mask was data minimisation
inside an already-authorized context, not a privacy boundary.

Its rationale has since expired: the whole point of the screen is that staff
contact people waiting on a product, and a number missing four digits cannot be
dialled. The field is now `phone`, full and unmasked — the same representation
`userRepo.listCustomers` already returns to admins (STEP 43), so there is one
admin phone shape, not two, and no second masking rule to drift.

**What did not change** is the boundary that actually matters. The customer-facing
restock routes never carried a phone at all — `listMine` does not join `users` —
and they still don't. The new suite asserts this by scanning the **entire
response body** for the subscriber's digits rather than checking a named field,
because the next leak will arrive in a field nobody thought to assert on.

The dashboard shows the number copyable in LTR with a WhatsApp icon that opens
`wa.me/<digits>` — reusing `admin/src/utils/phone.ts` from STEP 43. It opens a
chat and sends nothing.

## 45.2 `colorScheme.outline` is an outline token, not a text token

Light theme defines it as `Color(0x1F1C103A)` — **12% alpha**. Dark theme defines
it as `Color(0xFF7D739E)` — fully opaque. So the same token measured **1.29:1**
in light and 4.13:1 in dark: a bug that only existed in one theme, which is
exactly the kind that survives review.

29 occurrences were audited one by one:

| Role | Count | Verdict |
|---|---:|---|
| Text | 17 | **fixed** → `onSurfaceVariant` (5.28:1 light / 7.13:1 dark), one → `onSurface` |
| Meaningful icons | 9 | **fixed** → `onSurfaceVariant`; at 1.29:1 they were below the 3:1 bar of WCAG 1.4.11 |
| `BorderSide` on inputs | 2 | **kept** — correct token in its correct role, and the field's boundary is carried by `filled: true` + `fillColor`, not the border |
| Carousel dot fill | 1 | **kept** — decorative pagination; the active dot differs by colour *and* by being 3× wider |

The one `onSurface` exception is the "not yet rated" status pill: `OtakuStatusPill`
uses a single colour for its 14%-alpha background, its dot **and** its label, so
`onSurfaceVariant` lands at 4.40:1 — just under AA. `onSurface` gives 13.22:1
light / 11.28:1 dark without touching the shared component's alpha, which every
other pill colour depends on.

## 45.3 The same defect, found again in the status colours

Auditing for hard-coded and mis-roled text colours turned up 18 more places where
`success` / `error` — tuned as **indicators**, where the bar is 3:1 — were painting
text: field validation errors (`errorStyle` in both `app_theme.dart` and two field
widgets), rejection reasons, the error empty-state, "لم يتم قبول تقييمك", the
logout label, delivery confirmations, and the "✓ اشترى هذا المنتج" badge.

Measured on the surfaces they actually sit on, they ranged **2.39–3.00:1**. All 18
now use the `successText` / `errorText` tokens added in STEP 43, measuring
**4.61–5.68:1** in light and **5.38–8.88:1** in dark — every surface passing AA.

Four of them used `AppColors.error` / `AppColors.success` — the *static light*
constants — so the dark theme was being served light-theme values regardless of
mode. Those now read through the theme extension.

## 45.4 The rule, and the tripwire that enforces it

**`colorScheme.outline` is reserved for outline and border semantics. Text colours
come from the centralized semantic tokens** — `onSurface` for primary,
`onSurfaceVariant` for secondary, `onSurfaceDisabled` for disabled, and
`successText` / `errorText` / `infoText` for status text.

`test/semantic_text_colors_test.dart` enforces this at the system level rather
than per-screen, so it does not break when a screen is redesigned. It scans every
file in `lib/` and fails when a colour assignment inside a `TextStyle` /
`textTheme` / `hintStyle` / `labelStyle` context uses `outline`, uses a bare
`success` / `error` / `info` indicator token, or hard-codes a hex literal. It then
measures every text token against every surface it is drawn on, in both themes,
and asserts AA. It was verified to fail — naming the exact file and line — by
reintroducing the original defect, then verified to pass again once reverted.

# STEP 46 — BRAND: OTAKU GALAXY VISUAL REFRESH (STAGE 12 APPLIED)

The approved 14-stage brand system arrived with a prepared Flutter handoff
(`12_APP_BRANDING/flutter-patch/`). This step applies it. It is a **visual
rebrand, not an app redesign**: screen structure, navigation, IA, flows,
features, business logic, API contracts, `AppDimens`, `AppBreakpoints`,
`AppIcons` and the type scale are all unchanged, and no widget API moved.

The handoff was written against `@prod` with read-only access and no Flutter
toolchain. This repository had moved since. **The repository is the
implementation source of truth; Stage 14 is the brand source of truth.** Where
the handoff and the code disagreed, the code won and the deviation is recorded
in §46.6.

## 46.1 Commit boundary

| | |
|---|---|
| Baseline | `e2af2599f10475732a7c6cb022b196cee5f8980f` |
| Brand refresh | `a8f8369337dc17d4f4bc35f33d4d392c73e11b54` |

The baseline commit captures accumulated development work that was sitting
uncommitted; it contains **no** brand change. The refresh is the sole child of
that baseline, so `git revert a8f8369` undoes the entire rebrand and nothing
else. That separation was the reason for the baseline commit.

Scope: **50 files, +249 / −175** — 23 text files, 27 assets (1 added, 1 deleted,
25 replaced).

## 46.2 Palette

`app_colors.dart` was replaced with the approved Stage 02 palette: six brand
colours — magenta `#F0459B`, violet `#8B5CF6`, blue `#4FA3F0`, indigo `#3B2FA8`,
purple `#6D3BC0`, gold `#F6C144` — over the brand ground `#0B0718` and its
surfaces `#120C24` / `#16102E` / `#241A54`. Added: `indigo`, `groundDark`,
`surfaceDark*`, `onSurfaceDark*`, `onAccent`, `categoryGradients`.

`animeHeroGradient` and `bannerGradient` were writing their three colours as
literals; they now read the tokens, so they cannot drift from the palette again.
Every gradient's `begin`, `end` and `stops` are untouched — only colours moved.

**Deliberately unchanged:** every status colour (`success` / `warning` / `error`
/ `info` and their `*Text` variants) and every light surface and light ink value.
Status colours signal state, not identity; changing them would change meaning.

## 46.3 Decisions taken

**Decision 1 — category tiles: brand-pure remap accepted.** Pairs 2 (الحقائب)
and 5 (مجسمات وهدايا) used `#22B07D`, the functional success green, as a
*category identity* colour. They are now `[accentCyan, indigo]` and
`[primary, primaryDark]`. This visibly changes the hue of two tiles. `#22B07D`
remains in the palette and remains in use wherever it carries genuine success
semantics — see the order status card in §46.5.

**Decision 2 — splash: retinted, not redesigned.** The handoff instructed a flat
`AppColors.groundDark` ground. That instruction targeted an older splash. The
splash has since been rebuilt as a light, animated 1:1 reconstruction across
`splash_backdrop.dart` / `splash_brand.dart` / `splash_loader.dart`, with
near-black title ink `#1B1036`. A flat dark ground would have dropped the title
to roughly 1.1:1 — unreadable. **The stale instruction was superseded.** The
three backdrop stops were instead re-derived from the new brand: each old stop's
white-blend alpha was solved against the old brand colour and reapplied to the
new one. The screen stays light, every animation and the composition are intact.

| stop | before | after | title contrast before → after |
|---|---|---|---|
| 0 | `#FDF3F8` | `#FEF3F9` | 16.48 → **16.53:1** |
| 1 | `#F2EBFE` | `#F2EDFE` | 15.41 → **15.61:1** |
| 2 | `#E9E2FB` | `#EBE3FD` | 14.26 → **14.43:1** |

The halos already read `AppColors.secondary` / `.primary`, so they followed the
palette with no edit. Title, tagline and loader ink were left alone as neutral
values; readability is preserved to within 0.2 of the previous figures.

**Decision 3 — colour literals: brand-derived only.** Literals provably derived
from the old brand palette were moved onto tokens. Functional neutrals, ink,
scrims, overlays, white-alpha values and third-party brand colours were **not**
converted. `account_screen.dart` lines 228 / 237 / 246 hold `#1C1B22`,
`#E1306C` and `#25D366` — TikTok, Instagram, WhatsApp — and are untouched.

**Decision 4 — typography and iconography unchanged.** Cairo (body) + Tajawal
(headings) are kept: Stage 03 records this as an explicit implementation
exception, since Zen Kaku has no Arabic coverage and swapping the Arabic face
reflows every screen. Material Icons are kept: Stage 07 states the app's icon
migration is a separate job, so **zero icons changed** in this step.

## 46.4 Logo

The widget drew a JPEG with `BoxFit.cover` and `alignment: topCenter` inside a
`ClipRRect` — the artwork was **cropped**, and JPEG carries no transparency so
the mark dragged its own background. Both violate the Stage 01 lock. It is now
`assets/branding/otaku-mark.png`, `BoxFit.contain`, no crop, no rounded corner.
The asset is byte-identical (md5 `5bd5c07c…`) to the Stage 01 locked master
`mark-transparent-png/otaku-mark-512.png`, and 88% of its pixels are fully
transparent.

The splash additionally wrapped the logo in a `DecoratedBox` carrying a 34px
radius and a drop shadow. Stage 01 lists shadow and glow under NEVER; the plate
only ever looked right because the JPEG was opaque and clipped. With a
transparent PNG it renders as a rounded rectangle floating behind the artwork.
Both were removed.

Nine constructor parameters are now marked `@Deprecated` rather than deleted, so
no call site breaks. Eight of them had no effect on `build()` before this step
either — including `cupColor` and `steamColor`, left over from a previous
coffee-cup logo concept. The ninth, `cornerRadius`, did have an effect: it set
the radius of the `ClipRRect` that has now been removed.

## 46.5 What the sweep did and did not touch

| file | change | why |
|---|---|---|
| `otaku_sheet.dart` | `#0C0718` → `AppColors.groundDark` | brand ground |
| `community_screen.dart` | `#08050F` → `AppColors.groundDark` | brand ground |
| `personalize_cards.dart` | 3 dark values → tokens | it *previews* the theme, so it must read what it previews |
| `account_screen.dart` | 2 gradients → tokens | brand |
| `home_compositions.dart` | 4 promo pairs → tokens | decorative, no status meaning |
| `onboarding_slides.dart` | 6 alpha-tinted values | alpha byte preserved |
| `order_detail_screen.dart` | 4 status gradients → tokens | see below |

The order status card keeps its meaning. `#22B07D` stays on *confirmed* and
*completed* and `#FFB02E` stays on *pending*, now read as `AppColors.success`
and `AppColors.warningLight`; only the decorative halves moved to the new brand.
The *rejected* branch already read `colors.error` / `colors.errorLight`. The
card now reads functional tokens throughout instead of mixing tokens and hex.

Left unchanged as functional, not brand: `anime_product_card.dart:340` and
`product_detail_screen.dart:183` (`#180F30` ink at alpha), `splash_loader.dart`
(divider + caption ink), `splash_brand.dart` title/tagline/halo,
`auth_scaffold.dart` ink pairs, `otaku_bottom_nav.dart` `--txt3` ink and white
alphas, and `personalize_cards.dart` `ink` / `hairline`.

## 46.6 Deviations from the handoff — all confirmed against the code

1. **The JPEG had three call sites in `lib/`, not one.** The handoff states the
   widget was "the only reference … I grepped". `force_update_screen.dart:109`
   and `offline_gate.dart:123` also read it, each repeating the same crop.
   Deleting the asset first — as instructed — would have crashed both screens at
   runtime. All three were migrated first; the two inline copies now call
   `OtakuStoreLogoSimple(size: 38)`, so the crop cannot come back. Branding
   asset literals in `lib/` went from 3 to 1.
2. **The splash had been rebuilt**, so the flat dark-ground instruction and its
   `splash_screen.dart:113–196` line references were stale. See Decision 2.
   `splash_screen.dart` now holds no colour at all; it is pure composition.
3. **Six raster icon sizes did not exist in the brand set.** The handoff claims
   "20/29/40/60/76/152/180/1024 cover every slot" — those are *point* sizes. The
   required pixel sizes are 20 · 29 · 40 · 58 · 60 · 76 · 80 · 87 · 120 · 152 ·
   167 · 180 · 1024, plus Android 144. Android **144** and iOS **58 · 60 · 80 ·
   87 · 167** were absent and were rendered from the locked
   `otaku-square-mark.svg` via Inkscape. The pipeline was validated by rendering
   96px and diffing against the brand's own 96px PNG: mean channel delta
   **0.39/255**. `Contents.json` needed no edit.
4. **The predicted contrast failure was wrong.** The handoff warned
   `header_contrast_test.dart` "will very likely fail". It passes unchanged —
   measured worst case **3.18:1** against a 3.0 threshold. A different file
   failed instead; see §46.7.
5. **`home_compositions.dart:182` and `account_screen.dart:451`** were described
   in the handoff as dark panel tints. They are `Text` colours inside white
   pills, measuring 16.98:1 and 16.48:1. Left unchanged.
6. **`authGradientLight` needed retinting and the handoff missed it.** The patch
   retinted `AppColors.authGradient` — which is dead code, nothing references it
   — and `AppThemeColors.authGradientDark`, but left `authGradientLight`, which
   `auth_scaffold.dart:115` actually uses, on the old brand. The approved light
   values were applied to the live token.
7. **`otaku-mark-2x.png` was deliberately not shipped.** Flutter's
   resolution-variant convention is a `2.0x/` subdirectory, not a `-2x`
   filename, so as declared it would never have been selected. It is also
   unnecessary: the largest runtime render is 150 logical px, and 150 × 3 = 450
   < 512.

Also corrected: the handoff's verification grep matches `FFB02E` and `4EA8FF`,
which its own replacement file keeps as the functional `warningLight` and
`infoLight`. It could never have returned "no matches". The corrected grep is:

```
grep -rniE '0xFF(7C5CFF|FF3D8F|A08CFF|4A2FBF|ECEBFF|FF6FAE|B8195F|EC914E|191131|231A44|A79DC9|3D2B7A|1A152C)|0xFF(FFB02E|4EA8FF)' lib/ | grep -vE 'warningLight = |infoLight = '
```

It returns one hit: a doc comment in `app_colors.dart` quoting the old value
while explaining why `indigo` was added. That is documentation, not a live colour.

## 46.7 Known accessibility debt — NOT introduced by this refresh

`test/category_header_gradient_test.dart` carries a `[NOTE]` case that pins the
worst white-on-gradient contrast in the category palette. Its comment states
that any palette change must fail it so the trade-off is reconsidered
deliberately. **It fired, exactly as designed.**

| | worst bare contrast | palette colours below AA-large (3:1) |
|---|---|---|
| before (STEP 36 → baseline) | **1.83:1** on amber `#FFB02E` | 7 of 12 |
| after (this step) | **1.66:1** on gold `#F6C144` | **5 of 12** |

The single worst case is marginally worse because the approved gold is lighter
than the old amber. The aggregate improved: two fewer palette endpoints fall
below the threshold.

**The debt itself predates this step.** It was created in STEP 36, which removed
the 28% black scrim from the category header by explicit decision and recorded
the cost in §36.3. This refresh did not introduce it, did not widen the
decision, and did not reopen it. The pinned value and commentary were updated to
the measured figures; **the assertion was not weakened** — `lessThan(3.0)` still
stands, and the test still fails on the next palette change.

Scoped follow-up, if it is ever wanted: a shadow on the title text, or a scrim
confined behind the title line alone — not a layer over the whole gradient. That
remains the remedy STEP 36 identified and it is still the right one.

## 46.8 Verification

`flutter analyze` — clean, before and after.

`flutter test` — **814 passed, 2 skipped, 11 failed**, byte-identical to the
pre-change baseline. All 11 failures are `test/api_integration_test.dart`, which
targets `http://localhost:4000/api`; nothing is listening on 4000 or 4001, and
the failures are `LateInitializationError` from the unreachable setup. They are
**pre-existing and environmental**, not caused by this step. The brand, contrast,
identity, splash, header, onboarding, personalize and responsive-layout subset —
459 tests — passes in full.

Measured from the committed values, not assumed:

- category gradients, white title over the 28% scrim: worst **3.18:1** (≥ 3.0)
- `onSurfaceDark` on `groundDark`: **16.73:1**; `onSurfaceDarkVariant`: **5.91:1**
- `isDarkScheme` guard: `#0B0718` luminance **0.0029**, so the getter still
  returns true and the dark theme still resolves
- 19 iOS `Contents.json` slots and 5 Android mipmaps all present at the exact
  required pixel size; no stock Flutter icon remains (originals were 442–1443 B)
- every `assets/…` path referenced in `lib/` resolves on disk and is covered by
  a `pubspec.yaml` entry

Two changes were confirmed visually in the running app: the mark renders
transparent and uncropped in the onboarding header, and
`GET /assets/assets/branding/otaku-mark.png` returns 200.

## 46.9 Android launch window — a flash fixed in passing

`drawable-v21/launch_background.xml` used `?android:colorBackground`, which
resolves **black** on a device in dark mode. The Flutter splash is always light,
so dark-mode devices showed a black flash before it. Both launch backgrounds now
point at `@color/brand_launch_background` (`#FEF3F9`, the splash's first stop),
declared in the new `android/app/src/main/res/values/colors.xml`.

## 46.10 Known remaining items

- **iOS launch image is still a 1×1 placeholder.** All three
  `LaunchImage.imageset` files are 68-byte 1×1 PNGs and were not touched.
  `LaunchScreen.storyboard` paints pure white behind them, against the splash's
  `#FEF3F9` — a near-imperceptible gap, unlike Android's black. Left alone
  deliberately: changing it is a launch-screen change, not a brand token change.
- **`README.md` §13.2's "47 asset literals"** no longer matches the source. It
  did not match at the baseline either (52 by a plain literal count, 50 now), so
  this is pre-existing drift from the STEP 28 scan, not a consequence of this
  step. Re-deriving the 44-slot catalogue is out of scope here.
