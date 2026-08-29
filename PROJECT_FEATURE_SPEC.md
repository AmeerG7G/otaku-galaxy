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
| B-3 | P2 | **Inactive governorates are invisible and unrecoverable.** `adminService.listGovernorates()` calls `governorateRepo.listActive`, and `adminGovernorateSchema` has no `isActive`, so a deactivated governorate cannot be seen or restored from the admin UI | `adminService.ts:256`, `validators/admin.ts` |
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
