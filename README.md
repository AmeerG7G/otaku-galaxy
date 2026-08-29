# Otaku Galaxy — مجرة الأوتاكو

Flutter storefront + Node/Express API + React admin dashboard, run across three
environments: **dev**, **staging**, **prod**.

> Feature-level behaviour and audit history live in
> [`PROJECT_FEATURE_SPEC.md`](PROJECT_FEATURE_SPEC.md). This file covers
> environments, branching and release.

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

## 2. Git branches

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

## 3. Flutter

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

### Build

```bash
flutter build apk       --flavor dev     -t lib/main_dev.dart
flutter build apk       --flavor staging -t lib/main_staging.dart
flutter build appbundle --flavor prod    -t lib/main_prod.dart
```

### Android application IDs

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

## 4. Backend

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

## 5. Admin dashboard

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

## 8. Testing

```bash
cd backend && npm test              # requires local Postgres
cd admin   && npx tsc -b && npm run build
flutter analyze
flutter test --exclude-tags integration   # what CI runs
flutter test                              # all, needs backend on :4000
```

Tests tagged `integration` talk to a live development server. Start it with
`cd backend && npm run dev` before running the full Flutter suite.

CI (`.github/workflows/ci.yml`) runs the backend suite against a throwaway
Postgres service, the admin typecheck and build, and Flutter analyze + tests.
It never touches a real database.
