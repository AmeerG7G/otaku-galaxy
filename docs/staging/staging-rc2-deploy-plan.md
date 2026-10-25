# Staging release candidate 2 — deployment plan (2026-10-26)

Release candidate: branch `release/staging-2`, code at `253c14a`, built on `origin/dev` `0e12e00`.
Nothing in this plan has been executed on the server. Every step marked **(owner)** needs the
owner's go-ahead at that point; the server is reachable only by the owner (no SSH key here).

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

## 3. The real staging environment (as recorded 2026-10-25)

The runbook (deploy §2) assumes `/srv/otaku-galaxy-staging`, compose project `otaku-staging`,
branch `staging`. The server does **not** match it:

| | Runbook | Server |
|---|---|---|
| Checkout | `/srv/otaku-galaxy-staging` | `/srv/otaku-galaxy/staging` |
| Branch | `staging` | local `dev` at `2bb8524` |
| Compose project | `-p otaku-staging` | `staging` (container `staging-api-1`, volume `staging_uploads`) |
| Host port | `4001` | unknown — the code at `2bb8524` defaulted to **4000** |
| Database | — | host cluster PG 16.15, DB `otaku_galaxy_staging` at **070**, role `otaku_galaxy_staging` owns every object; reached via `host.docker.internal` |
| Dashboard | — | `staging-admin.otakugalaxystore.com` is live; how it is served is unknown |

**[CRITICAL]** Use `-p staging` from `/srv/otaku-galaxy/staging`. The runbook's `-p otaku-staging`
would create a new, empty `otaku-staging_uploads` volume, and every product image would vanish.

## 4. Steps

### A. Git (owner approves pushing)

1. Push `release/staging-2` and merge it into `dev` (`--no-ff`, like `0e12e00`). Wait for CI
   (4 jobs) on the new `dev`.
2. PR **base `staging` ← compare `dev`**, merge commit, after the 3 required checks pass.

### B. Server inventory — read only (owner)

Run deploy §0, then record these values. They are inputs to step D:

```bash
cd /srv/otaku-galaxy/staging && git status --short | head && git log -1 --oneline
docker inspect staging-api-1 --format '{{.Config.Image}} {{json .HostConfig.PortBindings}}'
docker inspect staging-api-1 --format '{{index .Config.Labels "com.docker.compose.project.config_files"}} {{index .Config.Labels "com.docker.compose.project.working_dir"}}'
docker volume ls | grep uploads
grep -rlE 'staging-admin' /etc/nginx/sites-enabled/ && grep -hE 'root|proxy_pass' $(grep -rlE 'staging-admin' /etc/nginx/sites-enabled/)
```

Stop if `git status` shows local changes in the checkout, or if the port is not one nginx proxies to.

### C. Migration rehearsal on a copy of live staging (owner)

```bash
sudo TARGET=<full hash of the staging merge commit> bash og-staging-rehearsal.sh
```

It reads the live database once (a fresh `pg_dump` into a new root-only file under
`/srv/otaku-galaxy/backups/staging/`), and does everything else in a `--network none` container.
Proceed only on `RESULT: ALL CHECKS PASSED`. The new backup is the rollback point for step D.

### D. Deploy the API (owner, explicit go)

```bash
( set -e
  cd /srv/otaku-galaxy/staging
  git fetch origin && git switch staging && git merge --ff-only origin/staging
  test "$(git rev-parse --abbrev-ref HEAD)" = staging
  export ENV_FILE=<as found in B> HOST_PORT=<as found in B> IMAGE_TAG=staging-$(git rev-parse --short HEAD)
  docker compose -p staging build api migrate
  docker compose -p staging --profile tools run --rm migrate      # expects 16: 071 … 086
  docker compose -p staging up -d api
  docker compose -p staging ps
  curl -fsS "localhost:$HOST_PORT/health"
)
```

- Before `migrate`: the gender diagnostic in deploy §12 (class A must be 0).
- After: the deploy §16 read-only check (two `|t` lines).
- **Skip** the §12 `analytics:rebuild` backfill: the analytics job's first tick builds and closes
  past months itself (the rehearsal shows it), and a rebuild of a closed month fails without
  `--include-closed`.
- The old image stays tagged `otaku-galaxy-api:latest` for a code rollback.

### E. Dashboard (owner)

Publish `admin-dist-staging-253c14a.tar.gz` (`dist/`) to wherever B shows `staging-admin` is served.
Keep the current files for rollback. Web push stays off (no Firebase), as today.

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

- Code only: `IMAGE_TAG=latest docker compose -p staging up -d api`. **Not verified** that the
  `2bb8524` code works on the 086 schema; prefer the full rollback below if anything fails.
- Full: stop the API, restore the step C backup into the database (pre-086 → deploy §16 path: exactly
  2 expected errors), start the previous image. Data written after the deploy is lost.

## 7. Before production (separate)

Staging accepted; production backup + rehearsal; production DB, secrets and API host (still
`.example`); Play signing (debug key today); version above 1.0.0 and the §14 minimum-version gate
before any pair price; monitoring and a backup schedule.
