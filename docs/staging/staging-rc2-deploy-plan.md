# Staging release candidate 2 — deployment plan (2026-10-26)

Release candidate: branch `release/staging-2`, code at `253c14a`, built on `origin/dev` `0e12e00`;
merged into `dev` as `e50c3657d26b5ae724bcce18935cbc8a68310577` (CI run 40238715129, 4 jobs green).
Nothing in this plan has been executed on the server. Every step marked **(owner)** needs the
owner's go-ahead at that point. The server inventory in §3 was read on 2026-10-26 (read-only SSH,
then `sudo docker` commands run by the owner); `otakugalaxy` is not in the `docker` group, so every
Docker command below needs `sudo`.

## 1. What the candidate contains

| Commit | Content |
|---|---|
| `0e12e00` (= `origin/dev`) | Everything through STEP 72: migrations 071–086, web store code, app-update policy, pair price, unpriced products, analytics, FCM code (disabled without Firebase). CI run 40229304762: all 4 jobs green |
| `69f6b5a` | Merge of `ui/kurdish-geometry-integrated`: Kurdish geometry gates 5–16 (owner decisions 2026-10-05) and "no text on character art" for the Home hero, rate-order and orders headers (owner decision 2026-10-12). Flutter only. One conflict (`bounded_text.dart`): the branch already contained all of `363b7b8`, which `dev` carried only partly (`9dd52de`) |
| `253c14a` | Cherry-pick of `9957511`: dashboard buttons were stuck "loading" for ~3 s after any failed save (27 `onError` handlers returned the toast promise). The `AppVersionCard` hunk was dropped: that card moved to its own page in STEP 70 |

Not included, on purpose:

- `release/rc-pre-staging` `9f6c033`, `2716272` and `claude/push-outbox-text-order` `5c838db`: already on `dev` in another form (`flutter analyze` clean; review queue at 536 keys; `e3def17`).
- The main checkout's uncommitted files (README notes, `docs/reference/`, `docs/qa/`, `tool/docs/`, `CLAUDE.md`, `android/gradle.properties`, `assets/art/characters/17.png` and `20.png`, 34 deleted `assets/images/*`). None is runtime code; `assets/images/` is not bundled. `20.png` swaps the character (Dazai → Frieren) with no recorded decision. Left untouched.

## 2. Verification of this candidate (local, 2026-10-26)

| Check | Result |
|---|---|
| Flutter `analyze` | No issues |
| Flutter `test --exclude-tags integration` (what CI runs) | **2496 / 2496**, 0 skipped |
| Admin `tsc -b`, full `vitest` | Clean; **391 / 391** |
| Admin `vite build --mode staging` | Built; only `staging-api.otakugalaxystore.com/api` as API host, STAGING badge present |
| Backend, web store | Byte-identical to `0e12e00` (CI green there: backend 2075 / 2075 incl. the 086 restore test; web store 51 / 51). Web store re-run here: typecheck, lint, 51 / 51, `next build` |
| Android `flutter build apk --flavor staging -t lib/main_staging.dart --release` | Built, 75.3 MB. `com.otakugalaxy.otaku_galaxy.staging`, `1.0.0-staging` (code 1), target SDK 36, **debug-signed**. API host `staging-api.otakugalaxystore.com/api`; the dev fallback string `10.0.2.2:4000` is present but overridden at startup (bootstrap passes the staging config to DI and the media origin) |
| Migration rehearsal script (`og-staging-rehearsal.sh`, this folder) | Run locally with its test hooks against a fake "live" database migrated by `2bb8524` (the VPS code, ends at 070) with seeded products, customers and orders: **ALL CHECKS PASSED** — pre-086 backup restores with exactly the 2 known errors, 16 migrations (071–086) as the non-superuser role in 3 s, idempotent, row counts unchanged, 086 creates both search indexes, a post-086 backup restores with `--exit-on-error`, API boots and every read route returns 200 |

Not verified: CI on `69f6b5a`/`253c14a` (needs a push); the APK on a device; anything on the server.

## 3. The real staging environment (verified 2026-10-26)

The runbook (deploy §2) assumes `/srv/otaku-galaxy-staging`, compose project `otaku-staging`,
branch `staging`. The server does **not** match it:

| | Runbook | Server |
|---|---|---|
| Host | — | `vmi3614219`, Ubuntu 24.04.5 LTS, 4 CPU, 7.9 GB RAM, no swap, 91 GB free; nginx 1.24.0 |
| Checkout | `/srv/otaku-galaxy-staging` | `/srv/otaku-galaxy/staging`, clean |
| Branch | `staging` | local `dev` at `2bb8524` (no local `staging` branch) |
| Compose project | `-p otaku-staging` | **`staging`**, network `staging_default` |
| API container | — | **`staging-api-1`**, image **`otaku-galaxy-api:staging-2bb8524`** (built 2026-09-30 00:27 UTC, after commit `2bb8524`), restart `unless-stopped`, healthy |
| Host port | `4001` | **`127.0.0.1:4001` → 4000**; nginx upstream `otaku_staging_api` = `127.0.0.1:4001` |
| Env file | `./backend/.env.staging` | **`./backend/.env.staging`** (the container's variable names match it). `APP_ENV=staging`; `MIGRATION_DATABASE_URL` empty, so migrations use `DATABASE_URL`; `PUSH_PROVIDER=fcm` with empty `FCM_*` (push stays "not configured", as today) |
| Uploads | — | volume **`staging_uploads`** → `/app/uploads`, 2830 files, 48 MB |
| Database | — | host cluster PG 16.15 (`16/main`), DB `otaku_galaxy_staging` at **070**, role `otaku_galaxy_staging` owns every object; reached via `host.docker.internal:5432` |
| Dashboard | — | nginx serves static files from **`/srv/otaku-galaxy/staging/admin/dist`** (gitignored; built 2026-09-28 18:45, before the Admins/Analytics/App-update pages) |
| Other images | — | `otaku-galaxy-api:latest` (2026-09-28, older than the running image), `staging-migrate:latest` (2026-09-30, migrations up to 070) |
| Backups | — | `/srv/otaku-galaxy/backups/staging/` (root, 700): `staging-pre-dev-2bb8524-20260930-021835.dump` and `staging-pre-7ffacb1-20261025T180406Z.dump` |
| Leftover | — | container **`og-086-rehearsal`** (postgres:16-alpine, `--network none`, no ports, the 10-25 backup mounted read-only, volume `og-086-rehearsal-data`): the manual 086 restore test of 2026-10-25. Isolated, but it holds a copy of staging data; removing it is the owner's decision. The rehearsal script ignores it (it only handles `og-rehearsal*`) |

**[CRITICAL]** Use `-p staging` from `/srv/otaku-galaxy/staging`. The runbook's `-p otaku-staging`
would create a new, empty `otaku-staging_uploads` volume, and every product image would vanish.

## 4. Steps

### A. Git (owner approves pushing)

1. Push `release/staging-2` and merge it into `dev` (`--no-ff`, like `0e12e00`). Wait for CI
   (4 jobs) on the new `dev`.
2. PR **base `staging` ← compare `dev`**, merge commit, after the 3 required checks pass.

### B. Server inventory — done 2026-10-26 (§3)

Right before step D, re-check that nothing moved since §3 (read only):

```bash
sudo docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
git -C /srv/otaku-galaxy/staging --no-optional-locks status --short | head
```

Expected: `staging-api-1  otaku-galaxy-api:staging-2bb8524  127.0.0.1:4001->4000/tcp  Up … (healthy)`
and a clean checkout. Anything else: stop.

### C. Migration rehearsal on a copy of live staging (owner)

The RC edition of the script is on `dev`; take it from there (`fetch` only updates remote refs):

```bash
git -C /srv/otaku-galaxy/staging fetch origin
git -C /srv/otaku-galaxy/staging --no-optional-locks show origin/dev:docs/staging/og-staging-rehearsal.sh > ~/og-staging-rehearsal.sh
sudo TARGET=<full hash of the commit to deploy> bash ~/og-staging-rehearsal.sh
```

`TARGET` is the commit that step D deploys: `e50c3657d26b5ae724bcce18935cbc8a68310577` today, or
the `staging` merge commit once the PR is merged (rehearse that one if it differs).

It reads the live database once (a fresh `pg_dump` into a new root-only file under
`/srv/otaku-galaxy/backups/staging/`), and does everything else in a `--network none` container.
Proceed only on `RESULT: ALL CHECKS PASSED`. The new backup is the rollback point for step D.

### D. Deploy the API (owner, explicit go)

```bash
( set -e
  cd /srv/otaku-galaxy/staging
  git fetch origin && git switch staging && git merge --ff-only origin/staging
  test "$(git rev-parse --abbrev-ref HEAD)" = staging
  export ENV_FILE=./backend/.env.staging HOST_PORT=4001 IMAGE_TAG=staging-$(git rev-parse --short HEAD)
  sudo -E docker compose -p staging build api migrate
  sudo -E docker compose -p staging --profile tools run --rm migrate      # expects 16: 071 … 086
  sudo -E docker compose -p staging up -d api
  sudo -E docker compose -p staging ps
  curl -fsS "localhost:$HOST_PORT/health"
)
```

- `sudo -E` keeps the three exported variables (the new compose file refuses to run without them).
- `git switch staging` creates the local `staging` branch from `origin/staging` (none exists yet).
- `build api migrate` rebuilds both images. The `migrate` service has no `image:` key, so compose
  names it `staging-migrate:latest`, which today holds the 070-era migrations; building only `api`
  would run the old migrator.
- `up -d api` recreates `staging-api-1` on the same `staging_uploads` volume and port 4001; nginx
  needs no change.

- Before `migrate`: the gender diagnostic in deploy §12 (class A must be 0).
- After: the deploy §16 read-only check (two `|t` lines).
- **Skip** the §12 `analytics:rebuild` backfill: the analytics job's first tick builds and closes
  past months itself (the rehearsal shows it), and a rebuild of a closed month fails without
  `--include-closed`.
- The running image keeps its tag **`otaku-galaxy-api:staging-2bb8524`**; that is the code-rollback
  image (`otaku-galaxy-api:latest` is an older 2026-09-28 build — do not use it).

### E. Dashboard (owner)

nginx serves `/srv/otaku-galaxy/staging/admin/dist` directly; switching branches does not change it
(it is gitignored). The new build is unpacked and the current one kept **outside** the checkout —
only `dist` itself is ignored, so any `dist.*` beside it would make the checkout dirty:

```bash
( set -e
  cd /srv/otaku-galaxy/staging/admin
  KEEP=~/admin-dist-2bb8524-$(date -u +%Y%m%dT%H%M%SZ)
  mkdir ~/admin-dist.new && tar -xzf ~/admin-dist-staging-253c14a.tar.gz -C ~/admin-dist.new --strip-components=1
  test -f ~/admin-dist.new/index.html
  mv dist "$KEEP" && mv ~/admin-dist.new dist          # same filesystem: two renames
  echo "rollback copy: $KEEP"
)
```

`admin-dist-staging-253c14a.tar.gz` (SHA-256 `de6fb3ae…597be1`) must be copied to the server first;
it contains `dist/` built with `--mode staging` (API `staging-api.otakugalaxystore.com/api`, STAGING
badge). Its code equals `e50c365`. Web push stays off (no Firebase), as today.

### F. Android

Give testers `otaku-galaxy-staging-1.0.0-253c14a.apk`. It is debug-signed **on this machine**: if a
staging build signed elsewhere is installed, Android refuses the update — uninstall it first (this
clears that app's data on the device only). It installs beside dev/prod builds (own package id).

### G. Web store — not in this release

deploy §13 stays «لا تُشغَّل» (owner decision 2026-10-25): no host, `BFF_SHARED_SECRET`, PM2 or nginx
site exist for it. The build is verified and archived (`web-store-next-build-253c14a.tar.gz`), but the
server must build from its own checkout (`npm ci && npm run build`) when §13 is done.

## 5. Acceptance tests on staging

1. Dashboard header shows **STAGING**; log in as a super admin.
2. `/health` 200; app Home loads; categories, product detail images (uploads volume intact).
3. Search in Arabic and Kurdish returns products (086 functions).
4. Customer checkout end to end: quote → order (083 idempotency) → admin approves → stock deducted.
5. Admin product edit: a deliberately failing save releases the button immediately (`253c14a`).
6. Unpriced product hidden from the app; pair price shown only where set (deploy §14 gate rules).
7. App in Kurdish at the largest text size: Home hero, rate-order and orders headers keep text off the
   character art; buttons do not overflow.
8. App update page in the dashboard: publish nothing; confirm the current policy reads back.
9. Take a new backup and restore it into a scratch DB with `pg_restore --exit-on-error` (exit 0).

## 6. Rollback

- Code only: from `/srv/otaku-galaxy/staging`,
  `ENV_FILE=./backend/.env.staging HOST_PORT=4001 IMAGE_TAG=staging-2bb8524 sudo -E docker compose -p staging up -d api`.
  **Not verified** that the `2bb8524` code works on the 086 schema; prefer the full rollback below
  if anything fails.
- Full: stop the API, restore the step C backup into the database (pre-086 → deploy §16 path: exactly
  2 expected errors), start `staging-2bb8524`. Data written after the deploy is lost.
- Dashboard: in `/srv/otaku-galaxy/staging/admin`, `mv dist ~/admin-dist-bad && mv <rollback copy printed in E> dist`.

## 7. Before production (separate)

Staging accepted; production backup + rehearsal; production DB, secrets and API host (still
`.example`); Play signing (debug key today); version above 1.0.0 and the §14 minimum-version gate
before any pair price; monitoring and a backup schedule.
