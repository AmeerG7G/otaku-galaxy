#!/usr/bin/env bash
# Otaku Galaxy — fresh staging backup + isolated migration rehearsal.
#
#   sudo TARGET=<full commit hash on GitHub> bash og-staging-rehearsal.sh
#
# Release candidate edition (2026-10-26). The live staging DB is at 070; the
# target applies 071–086. A backup taken before 086 restores with exactly two
# known errors (idx_products_search_ar_trgm / _ckb_trgm: `function
# search_fold(text) does not exist`). Following deploy/README.md §16, those two
# are accepted ONLY in that exact form and left for 086 to create; C.5 then
# proves both indexes valid and that a dump of the migrated copy restores with
# `pg_restore --exit-on-error` (exit 0). INDEX_FIX_APPROVED=1 keeps the old
# behaviour (rebuild them by hand before migrating) for a target without 086.
#
# A. Targeted cleanup: removes ONLY the previous rehearsal's container
#    `og-rehearsal-db` and directory `/tmp/og-rehearsal`, after confirming each
#    is what the previous run created. Anything unexpected → stop.
# B. Fresh backup: one read-only `pg_dump -Fc` of the live staging database as
#    the local `postgres` user (peer auth, no password, no connection string),
#    into a NEW root:root 600 file (noclobber). Verified: header, full read,
#    table list vs live, stderr empty. The live DB is only read here.
# C. Rehearsal on that backup, in a container with --network none: isolation
#    re-proved before restore, ownership kept, every restore error reported,
#    migrations run twice as the non-superuser role behind an identity gate,
#    counts before/after, schema checks, API boot + read smoke test inside the
#    same networkless namespace (no env file, no secrets), backups re-hashed.
#
# Never touches /srv/otaku-galaxy/staging, never reads an env file, never
# removes the new rehearsal resources or any backup. Report: $W/report.txt —
# counts, names, versions and statuses only.

set -Eeuo pipefail

BACKUP_DIR=${BACKUP_DIR:-/srv/otaku-galaxy/backups/staging}
PGDB=${PGDB:-otaku_galaxy_staging}
OLD_DUMP=${OLD_DUMP:-/srv/otaku-galaxy/backups/staging/staging-pre-dev-2bb8524-20260930-021835.dump}
OLD_SHA=${OLD_SHA:-6d7ed96944635bd0c05bbab0a6faef6caad2751b2d4acebafa2121ddea9838b1}
TARGET=${TARGET:?set TARGET to the full release-candidate commit hash (it must be on GitHub)}
REPO=${REPO:-https://github.com/AmeerG7G/otaku-galaxy.git}
PGIMG=${PGIMG:-postgres:16-alpine}
EXPECT_PG_MAJOR=${EXPECT_PG_MAJOR:-16}
ROLE=${ROLE:-otaku_galaxy_staging}
EXPECT_BASE=${EXPECT_BASE:-070_push_outbox_and_admin_devices.sql}
EXPECT_FINAL=${EXPECT_FINAL:-086_search_fold_schema_qualified.sql}
EXPECT_NEW=${EXPECT_NEW:-16}
PROBE_HOSTS=${PROBE_HOSTS:-172.17.0.1 172.18.0.1 host.docker.internal}
INDEX_FIX_APPROVED=${INDEX_FIX_APPROVED:-0}
PRE086_ACCEPTED=0
W=${W:-/tmp/og-rehearsal}
# Test hooks (local verification only): run as non-root, and reach a "live"
# database through `docker exec -u postgres <container>` instead of runuser.
REQUIRE_ROOT=${REQUIRE_ROOT:-1}
LIVE_DOCKER=${LIVE_DOCKER:-}

DB=og-rehearsal-db
IMG=og-rehearsal-migrate:${TARGET:0:7}
URL="postgres://$ROLE@127.0.0.1:5432/og_rehearsal"
REPORT="$W/report.txt"
# Files a previous run of og-rehearsal.sh / this script can leave in $W.
KNOWN_W_FILES="fetch.err fullread.err report.txt restore.log restore-errors.tsv before.txt after.txt build.log migrate1.log migrate2.log analytics.log pg_dump.stderr src postrestore.log"
# The one restore defect this rehearsal recognises (see section C.2).
KNOWN_IDX="idx_products_search_ar_trgm idx_products_search_ckb_trgm"
KNOWN_MSG='ERROR:  function search_fold(text) does not exist'

# ---------------------------------------------------------------- helpers
PRELOG=""
log() { if [ -f "$REPORT" ]; then printf '%s\n' "$*" | tee -a "$REPORT"; else printf '%s\n' "$*"; PRELOG+="$*"$'\n'; fi; }
section() { log ""; log "=== $* ($(date -u +%H:%M:%SZ))"; }
pass() { log "PASS  $*"; }
warn() { log "WARN  $*"; }
fail() {
  trap - ERR
  log "FAIL  $*"
  log ""
  log "Stopped. Nothing was removed; resources are left for inspection."
  [ -f "$REPORT" ] && log "Report: $REPORT"
  exit 1
}
trap 'fail "unexpected error at line $LINENO (exit $?)"' ERR

q()  { docker exec "$DB" psql -U postgres -d og_rehearsal -XAtq -v ON_ERROR_STOP=1 -c "$1"; }
qr() { docker exec "$DB" psql "$URL" -XAtq -v ON_ERROR_STOP=1 -c "$1"; }
in_ns() { docker run --rm --network "container:$DB" -e APP_ENV=dev -e DATABASE_URL="$URL" -e MIGRATION_DATABASE_URL="$URL" "$IMG" "$@"; }
# Read-only query / dump against the LIVE staging database, as local postgres.
live_psql() {
  if [ -n "$LIVE_DOCKER" ]; then docker exec -u postgres -e PGOPTIONS='-c default_transaction_read_only=on' "$LIVE_DOCKER" psql -d "$PGDB" -XAtq -v ON_ERROR_STOP=1 -c "$1"
  else runuser -u postgres -- env PGOPTIONS='-c default_transaction_read_only=on' psql -d "$PGDB" -XAtq -v ON_ERROR_STOP=1 -c "$1"; fi
}
live_dump() {
  if [ -n "$LIVE_DOCKER" ]; then docker exec -u postgres "$LIVE_DOCKER" pg_dump -Fc -Z gzip -d "$PGDB"
  else runuser -u postgres -- pg_dump -Fc -Z gzip -d "$PGDB"; fi
}
toc() { pg_restore --list "$1"; }

COUNTS="SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1;"

if [ "$REQUIRE_ROOT" = 1 ] && [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash $0" >&2; exit 1; fi
# runuser -u postgres inherits the cwd; an unreadable one makes psql/pg_dump warn on stderr.
cd /

# ================================================================ A. cleanup
section "A. Targeted cleanup of the previous rehearsal"
FOUND=$(docker ps -a --format '{{.Names}}' | grep '^og-rehearsal' || true)
case "$FOUND" in
  '') log "      no og-rehearsal container present" ;;
  "$DB")
    CIMG=$(docker inspect "$DB" --format '{{.Config.Image}}')
    CNET=$(docker inspect "$DB" --format '{{.HostConfig.NetworkMode}}')
    [ "$CIMG" = "$PGIMG" ] && [ "$CNET" = none ] || fail "container $DB is image=$CIMG network=$CNET — not the rehearsal container; not touching it"
    pass "confirmed $DB: image=$CIMG network=$CNET" ;;
  *) fail "unexpected og-rehearsal containers: $(tr '\n' ' ' <<< "$FOUND")" ;;
esac
if [ -e "$W" ]; then
  [ -d "$W" ] && [ ! -L "$W" ] || fail "$W is not a plain directory"
  [ -f "$W/report.txt" ] || fail "$W has no report.txt — not a rehearsal directory; not touching it"
  for f in $(ls -A "$W"); do
    case " $KNOWN_W_FILES " in *" $f "*) ;; *) fail "$W contains unexpected entry '$f' — not touching it" ;; esac
  done
  pass "confirmed $W: only rehearsal files ($(ls -A "$W" | tr '\n' ' '))"
else
  log "      $W not present"
fi
[ -z "$FOUND" ] || { docker rm -f -v "$DB" > /dev/null; log "      removed container $DB (and its anonymous data volume)"; }
[ ! -e "$W" ] || { rm -rf -- "$W"; log "      removed $W"; }
[ -z "$(docker ps -a --format '{{.Names}}' | grep '^og-rehearsal' || true)" ] || fail "an og-rehearsal container still exists"
[ ! -e "$W" ] || fail "$W still exists"
pass "cleanup verified: no og-rehearsal container, no $W"

mkdir -m 700 "$W"
printf '%s' "$PRELOG" > "$REPORT"

# ================================================================ B. fresh backup
section "B. Fresh backup of live $PGDB (read-only)"
[ -d "$BACKUP_DIR" ] || fail "backup directory missing: $BACKUP_DIR"
LIVE_VER=$(live_psql "SHOW server_version")
LIVE_MIG=$(live_psql "SELECT count(*)||' / '||max(name) FROM schema_migrations")
LIVE_TABLES=$(live_psql "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
log "      live (read-only): server $LIVE_VER, schema_migrations $LIVE_MIG, $LIVE_TABLES public tables"
[ "${LIVE_MIG##* / }" = "$EXPECT_BASE" ] || fail "live staging is at ${LIVE_MIG##* / }, expected $EXPECT_BASE — stop, the plan assumes 070"

TS=$(date -u +%Y%m%dT%H%M%SZ)
NEW_DUMP="$BACKUP_DIR/staging-pre-${TARGET:0:7}-$TS.dump"
[ ! -e "$NEW_DUMP" ] || fail "$NEW_DUMP already exists"
DUMP_RC=0
( trap - ERR; umask 077; set -o noclobber; live_dump > "$NEW_DUMP" ) 2> "$W/pg_dump.stderr" || DUMP_RC=$?
[ "$DUMP_RC" = 0 ] || { head -5 "$W/pg_dump.stderr" | cut -c1-200 | tee -a "$REPORT"; fail "pg_dump exit $DUMP_RC (partial file left at $NEW_DUMP, not deleted)"; }
[ ! -s "$W/pg_dump.stderr" ] || { head -5 "$W/pg_dump.stderr" | cut -c1-200 | tee -a "$REPORT"; fail "pg_dump wrote to stderr — treating as incomplete"; }
if [ "$REQUIRE_ROOT" = 1 ]; then chown root:root "$NEW_DUMP"; fi
chmod 600 "$NEW_DUMP"
NEW_SHA=$(sha256sum "$NEW_DUMP" | cut -d' ' -f1)
log "      path:   $NEW_DUMP"
log "      sha256: $NEW_SHA"
log "      stat:   $(stat -c '%U:%G mode=%a size=%s bytes modified=%y' "$NEW_DUMP")"
pass "pg_dump exit 0, no stderr output"

toc "$NEW_DUMP" > /dev/null || fail "pg_restore --list cannot read the new backup"
toc "$NEW_DUMP" | grep -E '^;.*(Dumped|Format|Compression)' | sed 's/^;\s*/      /' | tee -a "$REPORT"
DUMPED_FROM=$(toc "$NEW_DUMP" | sed -n 's/^;.*Dumped from database version: \([0-9]*\).*/\1/p')
[ "$DUMPED_FROM" = "$EXPECT_PG_MAJOR" ] || fail "dumped from major $DUMPED_FROM, expected $EXPECT_PG_MAJOR"
pg_restore -f /dev/null "$NEW_DUMP" 2> "$W/fullread.err" || { head -5 "$W/fullread.err" | tee -a "$REPORT"; fail "full read/decompression failed"; }
rm -f -- "$W/fullread.err"
TOC_TABLES=$(toc "$NEW_DUMP" | grep -vE '^;' | awk '$4=="TABLE" && $5!="DATA"' | wc -l)
TOC_DATA=$(toc "$NEW_DUMP" | grep -c 'TABLE DATA' || true)
[ "$TOC_TABLES" = "$LIVE_TABLES" ] || fail "backup lists $TOC_TABLES tables, live has $LIVE_TABLES"
[ "$TOC_DATA" = "$LIVE_TABLES" ] || fail "backup has $TOC_DATA TABLE DATA entries for $LIVE_TABLES tables"
pass "full read OK; $(toc "$NEW_DUMP" | grep -vc '^;') TOC entries; $TOC_TABLES tables with data entries = live table count"
DUMP=$NEW_DUMP
EXPECT_SHA=$NEW_SHA

# ================================================================ C.1 isolated DB
section "C.1 Isolated database"
docker run -d --name "$DB" --network none --memory 1g --cpus 1 -e POSTGRES_HOST_AUTH_METHOD=trust "$PGIMG" > /dev/null
for _ in $(seq 1 90); do docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres -q > /dev/null 2>&1 && break; sleep 2; done
docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres -q > /dev/null 2>&1 || fail "postgres not ready on 127.0.0.1 after 180s"
VER=$(docker exec "$DB" psql -U postgres -XAtc 'SHOW server_version')
[ "${VER%%.*}" = "$EXPECT_PG_MAJOR" ] || fail "rehearsal server $VER, expected major $EXPECT_PG_MAJOR"
pass "rehearsal server $VER (live $LIVE_VER)"
NETMODE=$(docker inspect "$DB" --format '{{.HostConfig.NetworkMode}}')
PORTS=$(docker inspect "$DB" --format '{{json .NetworkSettings.Ports}}')
[ "$NETMODE" = none ] || fail "network mode '$NETMODE'"
case "$PORTS" in '{}'|'null') ;; *) fail "published ports: $PORTS" ;; esac
IFACES=$(docker exec "$DB" ip -o addr | awk '{print $2}' | sort -u | tr '\n' ' ')
[ "$IFACES" = "lo " ] || fail "interfaces other than lo: $IFACES"
pass "network=none, ports=$PORTS, interfaces: $IFACES"
for t in $PROBE_HOSTS; do
  rc=0; docker exec "$DB" pg_isready -h "$t" -p 5432 -t 3 > /dev/null 2>&1 || rc=$?
  case "$rc" in 0|1) fail "probe $t:5432 answered (pg_isready=$rc) — isolation broken" ;; esac
  pass "probe $t:5432 unreachable (pg_isready=$rc)"
done

# ================================================================ C.2 restore
section "C.2 Restore (ownership kept)"
docker exec "$DB" psql -U postgres -XAtq -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE $ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE" \
  -c "CREATE DATABASE og_rehearsal OWNER $ROLE"
q "CREATE TABLE og_rehearsal_sentinel (created_at timestamptz NOT NULL DEFAULT now())"
q "INSERT INTO og_rehearsal_sentinel DEFAULT VALUES"
q "ALTER TABLE og_rehearsal_sentinel OWNER TO $ROLE"
pass "role $ROLE (non-superuser) owns database og_rehearsal; sentinel created"

# Every error is collected and printed (headline + the DDL statement for index
# errors; never row data). The run continues ONLY if the errors are exactly the
# known defect — the two named indexes failing with the one exact message — and
# INDEX_FIX_APPROVED=1. Any other error, or the known one without approval, stops.
T0=$(date +%s)
RESTORE_RC=0
cat "$DUMP" | docker exec -i "$DB" pg_restore -U postgres -d og_rehearsal --no-privileges > "$W/restore.log" 2>&1 || RESTORE_RC=$?
ERRORS=$(grep -c '^pg_restore: error:' "$W/restore.log" || true)
log "      pg_restore exit=$RESTORE_RC in $(( $(date +%s) - T0 ))s, errors=$ERRORS"
if [ "$ERRORS" != 0 ]; then
  awk '/^pg_restore: error:/ {msg=$0; next}
       /^Command was: / && msg != "" {sub(/^Command was: /, ""); print msg "\t" $0; msg=""}' "$W/restore.log" > "$W/restore-errors.tsv"
  while IFS=$'\t' read -r msg cmd; do
    log "      error:   ${msg#pg_restore: error: could not execute query: }"
    case "$cmd" in CREATE*INDEX*) log "      command: $(cut -c1-220 <<< "$cmd")" ;; *) log "      command: $(awk '{print $1, $2, $3}' <<< "$cmd") …" ;; esac
  done < "$W/restore-errors.tsv"
  ACT_IDX=$(awk -F'\t' '{print $2}' "$W/restore-errors.tsv" | sed -nE 's/^CREATE INDEX ([a-z_0-9]+) ON public\.products USING gin .*/\1/p' | LC_ALL=C sort | tr '\n' ' ')
  EXACT_MSG=$(awk -F'\t' -v m="pg_restore: error: could not execute query: $KNOWN_MSG" '$1==m' "$W/restore-errors.tsv" | wc -l)
  if ! { [ "$ERRORS" = 2 ] && [ "$(wc -l < "$W/restore-errors.tsv")" = 2 ] && [ "$EXACT_MSG" = 2 ] && [ "$ACT_IDX" = "$KNOWN_IDX " ]; }; then
    fail "restore errors outside the single known defect — see the errors above"
  fi
  warn "KNOWN RESTORE DEFECT (pre-086 backup): exactly $KNOWN_IDX failed — product_search_text_ar/_ckb call search_fold() without a schema, and pg_restore runs with search_path=''"
  if [ "$INDEX_FIX_APPROVED" != 1 ]; then
    [[ "$EXPECT_FINAL" > "086" ]] || fail "the target ends at $EXPECT_FINAL (before 086): re-run with INDEX_FIX_APPROVED=1 to rebuild exactly these 2 indexes in the rehearsal copy"
    PRE086_ACCEPTED=1
    pass "deploy §16 step 1: exactly the 2 expected errors; both indexes left for 086 to create (checked in C.5)"
  else
    while IFS=$'\t' read -r _ cmd; do
      qr "SET search_path = public, pg_catalog; $cmd" > /dev/null || fail "rebuilding failed: $(cut -c1-120 <<< "$cmd")"
    done < "$W/restore-errors.tsv"
    BUILT=$(q "SELECT count(*) FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE c.relname IN ('idx_products_search_ar_trgm','idx_products_search_ckb_trgm') AND i.indisvalid")
    [ "$BUILT" = 2 ] || fail "rebuilt indexes not both present and valid ($BUILT)"
    pass "INDEX_FIX_APPROVED: rebuilt the 2 indexes verbatim with search_path=public as $ROLE; both valid"
  fi
else
  pass "pg_restore: no errors"
fi
TOC_IDX=$(toc "$DUMP" | grep -vE '^;' | awk '$4=="INDEX"' | wc -l)
DB_IDX=$(q "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relnamespace='public'::regnamespace AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid=i.indexrelid)")
if [ "$PRE086_ACCEPTED" = 1 ]; then
  [ "$DB_IDX" = $(( TOC_IDX - 2 )) ] || fail "indexes: backup lists $TOC_IDX, restored copy has $DB_IDX (expected exactly the 2 search indexes missing)"
  pass "$DB_IDX of $TOC_IDX non-constraint indexes restored; the missing 2 are exactly the search indexes"
else
  [ "$TOC_IDX" = "$DB_IDX" ] || fail "indexes: backup lists $TOC_IDX, restored copy has $DB_IDX"
  pass "all $TOC_IDX non-constraint indexes in the backup exist in the restored copy"
fi

NOT_OWNED=$(q "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner <> '$ROLE'")
[ "$NOT_OWNED" = 0 ] || fail "$NOT_OWNED public tables not owned by $ROLE"
pass "all $(q "SELECT count(*) FROM pg_tables WHERE schemaname='public'") public tables owned by $ROLE (incl. sentinel)"
log "      function owners: $(q "SELECT string_agg(o||' '||n, ', ') FROM (SELECT pg_get_userbyid(proowner) o, count(*) n FROM pg_proc WHERE pronamespace='public'::regnamespace GROUP BY 1 ORDER BY 1) s")"
log "      extensions: $(q "SELECT string_agg(extname||' '||extversion, ', ' ORDER BY extname) FROM pg_extension")"

EXP_TABLES="account_requests admin_audit_log admin_notification_prefs admin_push_devices banners birthday_discount_usage cart_items carts categories collection_products collections device_tokens favorites franchises governorate_zones governorates loyalty_reward_redemptions media_files notifications order_items order_status_history orders points_ledger product_franchises product_images product_options products push_outbox restock_subscriptions reviews schema_migrations store_settings subcategories user_notification_prefs users verification_codes"
EXP_FUNCS="enqueue_notification_push franchise_search_text media_ref_to_relative next_birthday product_discount_percent product_search_text_ar product_search_text_ckb refresh_product_rating reviews_sync_product_rating safe_birthday_date search_fold search_like_pattern set_updated_at"
EXP_TRIGS="trg_admin_notification_prefs_updated_at trg_admin_push_devices_updated_at trg_banners_updated_at trg_carts_updated_at trg_categories_updated_at trg_collections_updated_at trg_device_tokens_updated_at trg_franchises_updated_at trg_governorate_zones_updated_at trg_governorates_updated_at trg_loyalty_redemptions_updated_at trg_notifications_enqueue_push trg_orders_updated_at trg_products_updated_at trg_reviews_sync_rating trg_reviews_updated_at trg_store_settings_updated_at trg_user_notification_prefs_updated_at trg_users_updated_at"
compare_set() {
  local missing extra
  missing=$(LC_ALL=C comm -23 <(tr ' ' '\n' <<< "$2" | LC_ALL=C sort -u) <(tr ' ' '\n' <<< "$3" | LC_ALL=C sort -u) | tr '\n' ' ')
  extra=$(LC_ALL=C comm -13 <(tr ' ' '\n' <<< "$2" | LC_ALL=C sort -u) <(tr ' ' '\n' <<< "$3" | LC_ALL=C sort -u) | tr '\n' ' ')
  if [ -z "$missing$extra" ]; then pass "$1 match a clean 001–070 chain"
  else warn "$1 differ from a clean 001–070 chain — missing: [${missing% }] extra: [${extra% }]"; fi
}
compare_set "tables" "$EXP_TABLES og_rehearsal_sentinel" "$(q "SELECT string_agg(tablename, ' ') FROM pg_tables WHERE schemaname='public'")"
compare_set "functions" "$EXP_FUNCS" "$(q "SELECT string_agg(proname, ' ') FROM pg_proc WHERE pronamespace='public'::regnamespace AND pg_get_userbyid(proowner)='$ROLE'")"
compare_set "triggers" "$EXP_TRIGS" "$(q "SELECT string_agg(tgname, ' ') FROM pg_trigger WHERE NOT tgisinternal")"

MIG_BEFORE=$(q "SELECT count(*) FROM schema_migrations")
MAX_BEFORE=$(q "SELECT max(name) FROM schema_migrations")
[ "$MAX_BEFORE" = "$EXPECT_BASE" ] || fail "restored schema_migrations ends at $MAX_BEFORE, expected $EXPECT_BASE"
pass "restored schema_migrations: $MIG_BEFORE rows, last $MAX_BEFORE (matches live)"
q "$COUNTS" | tr '|' ' ' | LC_ALL=C sort > "$W/before.txt"
log "      baseline: $(wc -l < "$W/before.txt") tables, $(awk '{s+=$2} END {print s}' "$W/before.txt") rows"

# ================================================================ C.3 migrator
section "C.3 Migrator image from a fresh clone"
# Shallow fetch of exactly TARGET, retried: a full clone is large and a dropped
# connection mid-transfer is the commonest failure here.
git init --quiet "$W/src"
FETCHED=0
for attempt in 1 2 3; do
  if git -C "$W/src" fetch --quiet --depth 1 "$REPO" "$TARGET" 2> "$W/fetch.err"; then FETCHED=1; break; fi
  log "      fetch attempt $attempt failed: $(tail -1 "$W/fetch.err" | cut -c1-120)"; sleep 5
done
[ "$FETCHED" = 1 ] || fail "could not fetch $TARGET from $REPO after 3 attempts"
rm -f -- "$W/fetch.err"
git -C "$W/src" -c advice.detachedHead=false checkout --quiet FETCH_HEAD
[ "$(git -C "$W/src" rev-parse HEAD)" = "$TARGET" ] || fail "clone is not at $TARGET"
[ "$(find "$W/src/backend" -maxdepth 1 -name '.env*' ! -name '*.example' | wc -l)" = 0 ] || fail "env files in fresh clone"
pass "clone at $TARGET, no env files"
T0=$(date +%s)
docker build --target builder --build-arg NODE_VERSION=22 -t "$IMG" "$W/src/backend" > "$W/build.log" 2>&1 \
  || { tail -20 "$W/build.log" | tee -a "$REPORT"; fail "image build failed"; }
[ "$(docker run --rm --network none --entrypoint sh "$IMG" -c 'ls -A /app | grep -c "^\.env" || true')" = 0 ] || fail "image contains .env files"
pass "built $IMG in $(( $(date +%s) - T0 ))s; image has no .env files"

# ================================================================ C.4 migrate
section "C.4 Migrate as $ROLE"
GATE=$(qr "SELECT current_database()||'|'||current_user||'|'||(SELECT rolsuper FROM pg_roles WHERE rolname=current_user)::text||'|'||(SELECT count(*) FROM og_rehearsal_sentinel)")
[ "$GATE" = "og_rehearsal|$ROLE|false|1" ] || fail "identity gate: got '$GATE'"
pass "identity gate: database|user|rolsuper|sentinel = $GATE"
T0=$(date +%s)
in_ns npx tsx scripts/migrate.ts > "$W/migrate1.log" 2>&1 \
  || { grep -vE '^\s*$' "$W/migrate1.log" | tail -15 | cut -c1-200 | tee -a "$REPORT"; fail "migration run failed"; }
APPLIED=$(grep -c 'applied' "$W/migrate1.log" || true)
log "      $(grep 'applied' "$W/migrate1.log" | sed 's/.*applied //' | tr '\n' ' ')"
[ "$APPLIED" = "$EXPECT_NEW" ] || fail "applied $APPLIED migrations, expected $EXPECT_NEW"
pass "run 1: applied $APPLIED migrations in $(( $(date +%s) - T0 ))s as non-superuser"
in_ns npx tsx scripts/migrate.ts > "$W/migrate2.log" 2>&1 || fail "second migration run failed"
grep -q 'no pending migrations' "$W/migrate2.log" || fail "second run was not a no-op"
pass "run 2: no pending migrations (idempotent)"

# ================================================================ C.5 checks
section "C.5 Post-migration checks"
MAX_AFTER=$(q "SELECT max(name) FROM schema_migrations"); MIG_AFTER=$(q "SELECT count(*) FROM schema_migrations")
[ "$MAX_AFTER" = "$EXPECT_FINAL" ] && [ "$MIG_AFTER" = $(( MIG_BEFORE + EXPECT_NEW )) ] || fail "schema_migrations $MIG_BEFORE -> $MIG_AFTER, last $MAX_AFTER"
pass "schema_migrations: $MIG_BEFORE -> $MIG_AFTER, last $MAX_AFTER"
q "$COUNTS" | tr '|' ' ' | LC_ALL=C sort > "$W/after.txt"
log "      before -> after (pre-existing tables):"
LC_ALL=C join -a1 "$W/before.txt" "$W/after.txt" | awk '{printf "        %-34s %8s -> %s%s\n", $1, $2, $3, ($1!="schema_migrations" && $2!=$3) ? "   CHANGED" : ""}' | tee -a "$REPORT"
CHANGED=$(LC_ALL=C join -a1 "$W/before.txt" "$W/after.txt" | awk '$1!="schema_migrations" && $2!=$3' | wc -l)
[ "$CHANGED" = 0 ] && pass "row counts unchanged in every pre-existing table (schema_migrations +$EXPECT_NEW)" || warn "$CHANGED pre-existing table(s) changed row count"
log "      new tables: $(LC_ALL=C join -v2 "$W/before.txt" "$W/after.txt" | awk '{print $1"("$2")"}' | tr '\n' ' ')"
check0() { local n; n=$(q "$2"); [ "$n" = 0 ] && pass "$1: 0" || fail "$1: $n"; }
check0 "tables not owned by $ROLE" "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner <> '$ROLE'"
check0 "orders without placed_by_role" "SELECT count(*) FROM orders WHERE placed_by_role IS NULL"
check0 "unvalidated constraints" "SELECT count(*) FROM pg_constraint WHERE NOT convalidated"
check0 "invalid indexes" "SELECT count(*) FROM pg_index WHERE NOT indisvalid"
check0 "disabled user triggers" "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'"
check0 "products without price" "SELECT count(*) FROM products WHERE price IS NULL"
check0 "orders with idempotency key" "SELECT count(*) FROM orders WHERE idempotency_key IS NOT NULL"
COLS=$(q "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND (table_name, column_name) IN (('orders','idempotency_key'),('orders','idempotency_fingerprint'),('orders','placed_by_role'),('orders','loyalty_gift_redemption_id'),('products','pair_price'),('order_items','pair_price'),('users','is_internal_account'),('admin_push_devices','session_expires_at'))")
[ "$COLS" = 8 ] || fail "expected 8 new columns, found $COLS"
pass "all 8 new columns present (073, 081, 082, 083 idempotency, 085)"

# deploy §16 steps 2–3, then the backup a post-086 deploy will produce.
QUALIFIED=$(q "SELECT count(*) FROM pg_proc WHERE proname IN ('product_search_text_ar','product_search_text_ckb') AND prosrc ~ 'public\.search_fold\('")
[ "$QUALIFIED" = 2 ] || fail "086: $QUALIFIED of 2 search functions call public.search_fold"
pass "086: product_search_text_ar|t product_search_text_ckb|t (deploy §16 check)"
SEARCH_IDX=$(q "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('idx_products_search_ar_trgm','idx_products_search_ckb_trgm') AND i.indisvalid AND i.indisready")
[ "$SEARCH_IDX" = 2 ] || fail "086: $SEARCH_IDX of 2 search indexes valid"
pass "086: both search indexes present and valid$([ "$PRE086_ACCEPTED" = 1 ] && echo ' (created by 086 after the pre-086 restore)')"
docker exec "$DB" psql -U postgres -XAtq -v ON_ERROR_STOP=1 -c "CREATE DATABASE og_restore_check TEMPLATE template0"
POST_RC=0
docker exec "$DB" sh -c 'pg_dump -U postgres -Fc -d og_rehearsal | pg_restore -U postgres --exit-on-error --no-privileges -d og_restore_check' > "$W/postrestore.log" 2>&1 || POST_RC=$?
[ "$POST_RC" = 0 ] || { head -5 "$W/postrestore.log" | cut -c1-200 | tee -a "$REPORT"; fail "post-086 backup: pg_restore --exit-on-error exit $POST_RC"; }
POST_IDX=$(docker exec "$DB" psql -U postgres -d og_restore_check -XAtq -c "SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('idx_products_search_ar_trgm','idx_products_search_ckb_trgm') AND i.indisvalid")
[ "$POST_IDX" = 2 ] || fail "post-086 backup restored without both search indexes ($POST_IDX)"
docker exec "$DB" psql -U postgres -XAtq -c "DROP DATABASE og_restore_check" > /dev/null
pass "post-086 backup of the migrated copy restores with --exit-on-error (exit 0), both search indexes valid"
log "      orders by placed_by_role: $(q "SELECT coalesce(string_agg(placed_by_role||' '||n, ', '),'none') FROM (SELECT placed_by_role, count(*) n FROM orders GROUP BY 1 ORDER BY 1) s")"

# ================================================================ C.6 API smoke
# Safe by construction: the API runs inside the rehearsal DB's namespace
# (--network container:, i.e. loopback only — no route to any live DB, as
# probed in C.1), with APP_ENV=dev and only the rehearsal URL: no env file,
# no secrets.
section "C.6 API boot + read smoke test (networkless namespace)"
SMOKE=$(docker run --rm --network "container:$DB" -e APP_ENV=dev -e PORT=4999 \
  -e DATABASE_URL="$URL" -e MIGRATION_DATABASE_URL="$URL" "$IMG" sh -c '
    node dist/server.js > /tmp/api.log 2>&1 & pid=$!
    for i in $(seq 1 30); do node -e "fetch(\"http://127.0.0.1:4999/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" && break; sleep 1; done
    node -e "
      const paths = [\"/health\", \"/api/catalog/home\", \"/api/catalog/categories\", \"/api/catalog/governorates\", \"/api/catalog/products\", \"/api/catalog/products/search?q=a\"];
      (async () => {
        for (const p of paths) {
          try {
            const r = await fetch(\"http://127.0.0.1:4999\" + p);
            const j = await r.json().catch(() => null);
            const d = j && j.data;
            const n = Array.isArray(d) ? d.length : (d && Array.isArray(d.items) ? d.items.length : (d ? typeof d : \"-\"));
            console.log(p + \" \" + r.status + \" success=\" + (j && j.success) + \" items=\" + n);
          } catch (e) { console.log(p + \" ERROR \" + e.message); }
        }
      })();"
    kill $pid 2>/dev/null; wait $pid 2>/dev/null
    echo "--- server log lines mentioning error/exception:"; grep -ciE "error|exception" /tmp/api.log || true
  ' 2>&1) || true
printf '%s\n' "$SMOKE" | sed 's/^/      /' | tee -a "$REPORT"
grep -qE '^/health 200 ' <<< "$SMOKE" || fail "API did not answer /health"
[ "$(grep -E '^/api/' <<< "$SMOKE" | grep -cvE ' 200 success=true' || true)" = 0 ] || fail "a read endpoint did not return 200/success"
pass "API booted as $ROLE on the migrated copy; all read endpoints 200"

# ================================================================ C.7 analytics
section "C.7 Analytics after the first job tick (rehearsal copy only)"
log "      periods: $(q "SELECT coalesce(string_agg(to_char(month,'YYYY-MM')||' '||status, ', ' ORDER BY month),'none') FROM analytics_periods")"
log "      monthly order rows: $(q "SELECT count(*) FROM analytics_monthly_orders"), daily sales rows: $(q "SELECT count(*) FROM analytics_daily_sales")"
OPEN_PAST=$(q "SELECT count(*) FROM analytics_periods WHERE status='open' AND month < date_trunc('month', now() - interval '8 days')")
[ "$OPEN_PAST" = 0 ] && pass "every past month past its grace period was closed (reconciliation matched)" || warn "$OPEN_PAST past month(s) still open"
NOW=$(date -u +%Y-%m)
if [ "$(q "SELECT count(*) FROM analytics_periods WHERE to_char(month,'YYYY-MM')='$NOW' AND status='open'")" = 1 ]; then
  T0=$(date +%s)
  in_ns npx tsx scripts/analyticsRebuild.ts --from "$NOW" --to "$NOW" --reason "rehearsal" > "$W/analytics.log" 2>&1 \
    || { grep -vE '^\s*$' "$W/analytics.log" | tail -10 | cut -c1-200 | tee -a "$REPORT"; fail "analytics rebuild of the open month failed"; }
  pass "analytics:rebuild of open month $NOW finished in $(( $(date +%s) - T0 ))s"
else
  warn "current month $NOW has no open period — rebuild not timed"
fi

# ================================================================ C.8 backups unchanged
section "C.8 Backups unchanged"
[ "$(sha256sum "$NEW_DUMP" | cut -d' ' -f1)" = "$NEW_SHA" ] || fail "new backup SHA-256 changed"
pass "new backup SHA-256 unchanged ($NEW_SHA)"
if [ -e "$OLD_DUMP" ]; then
  [ "$(sha256sum "$OLD_DUMP" | cut -d' ' -f1)" = "$OLD_SHA" ] || fail "old backup SHA-256 changed"
  pass "old backup SHA-256 unchanged ($OLD_SHA)"
fi

section "RESULT: ALL CHECKS PASSED"
log "New backup: $NEW_DUMP"
log "Kept for review (no network, no ports): container $DB, image $IMG, directory $W"
log "Cleanup needs separate approval:"
log "  sudo docker rm -f -v $DB; sudo docker image rm $IMG; sudo rm -rf -- $W"
trap - ERR
