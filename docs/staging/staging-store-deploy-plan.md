# Staging web store — deployment plan (2026-10-26)

**Status: prepared, not run.** Nothing here has been executed on the server. Each step below is a
separate owner-approved action; stop at the first unexpected result and do not retry, repair or roll
back without a separately approved plan.

Target: `https://staging-store.otakugalaxystore.com`, a **closed** staging storefront (tester password,
no indexing) over the live staging API. The production root `otakugalaxystore.com` is not touched,
and no production file, container, database or nginx site is involved.

## 1. Design

| | Decision | Why |
|---|---|---|
| Runtime | compose service `web` (profile `web`), image `otaku-galaxy-web:<IMAGE_TAG>` from `web-store/Dockerfile`, **project `staging`** | The host has no node/npm/pm2 (inspected 2026-10-26); the API already runs in Docker. One process manager, no system packages. |
| API access | `API_INTERNAL_URL=http://api:4000/api` over the project network `staging_default` | `127.0.0.1` inside the container is the container. No host port, no TLS hop, never the browser. |
| Publish | `127.0.0.1:3001` → container 3000 | Free on the host; loopback only, nginx is the only client. |
| Variables | server-only `web-store/.env.staging` (`WEB_ENV_FILE`), mode 600 | The API's env file holds `DATABASE_URL` and the JWT secret; the store gets none of it. |
| Shared secret | `BFF_SHARED_SECRET`, same value in `backend/.env.staging` and the store file | Absent on the API today (inspected) — without it every shopper is one rate-limit bucket. Needs an API recreate. |
| Edge | Cloudflare (proxied) → nginx `deploy/nginx/staging-store.conf` → `127.0.0.1:3001` | Same shape as `staging-api` / `staging-admin`. |
| Access control | nginx `auth_basic`, password file `/etc/nginx/staging-store.htpasswd` (root, outside Git) | The staging DB holds 189 user accounts and the store accepts cash-on-delivery orders: only testers may reach it. |
| No indexing | `X-Robots-Tag: noindex, nofollow, noarchive` on every response (401 included) + `robots.txt` `Disallow: /` (served without the password) | Home, category and product pages set no `noindex` themselves and there is no `robots.txt` in the app. |
| Client IP | `deploy/nginx/snippets/cloudflare-real-ip.conf` (Cloudflare ranges, `CF-Connecting-IP`), then `X-Real-IP` / `X-Forwarded-For` **overwritten** with `$remote_addr` | Without it every visitor is a Cloudflare address; without overwrite a visitor picks their own bucket. Forged headers from non-Cloudflare sources are ignored. |
| TLS | Let's Encrypt via `certbot certonly --webroot -w /var/www/certbot` (as the two existing sites) | HTTP-01 through Cloudflare already works for both existing certificates. |
| nginx syntax | `listen 443 ssl http2;` | The server runs nginx 1.24; `http2 on;` needs 1.25.1. |
| HSTS | not yet | Added (1 day, like the API) after HTTPS is verified on the host. |

Compose detail: `WEB_ENV_FILE` and `WEB_HOST_PORT` have **failing defaults** (`:-`), not `:?` —
compose interpolates every service on every command, so `:?` would break the documented API and
migrate commands. A missing `WEB_ENV_FILE` refuses to create the container; a missing
`WEB_HOST_PORT` publishes a random loopback port (nginx 502s), and step S5 asserts the port.
`web` has no `depends_on`, so `up --no-deps web` never recreates `api`.

Verified locally before review: compose config with and without the web variables (API commands
unaffected, web refuses without its env file); `nginx -t` on nginx 1.24 with the site + snippet;
nginx behaviour against a stub upstream (401 + noindex without password, `robots.txt` 200 without
password, http→https, ACME path not redirected, forged `X-Real-IP`/`X-Forwarded-For`/`CF-Connecting-IP`
from a non-Cloudflare address replaced by the real one, `Authorization` not forwarded, wrong password
401); `backend/tests/deploy-runbook.test.ts` pins the `web` service, the image (no env file, non-root)
and this nginx site (password, noindex, robots.txt, overwritten IP headers, `Authorization` and
`CF-Connecting-IP` not forwarded, no `http2 on`, no HSTS) — 16 tests, 15 mutants caught.

## 2. Prerequisites (owner)

1. This branch reviewed → `dev` → PR `staging` merged, CI green. Call the merged staging commit **`X`**.
2. Decide the tester user name and password (entered at a prompt in S7, never in chat or history).
3. Be ready to add the DNS record in Cloudflare (S6).
4. Know whether the 189 staging accounts are real people. The password gate keeps them out either
   way; testers must use test customer accounts only, and every test order is rejected in the
   staging dashboard afterwards.

## 3. Steps (all on the VPS, user `otakugalaxy`, each needs its own go)

### S1 — read-only preflight

```bash
( set -u
  cd /srv/otaku-galaxy/staging
  sudo docker compose version
  git rev-parse --abbrev-ref HEAD; git rev-parse HEAD; git status --porcelain | wc -l
  printf 'BFF lines in API env: '; grep -c '^BFF_SHARED_SECRET=' backend/.env.staging || true
  grep -qE '^BFF_SHARED_SECRET=.+' backend/.env.staging && echo 'API BFF secret: SET' || echo 'API BFF secret: empty/absent'
  ls -l web-store/.env.staging 2>&1
  sudo docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' staging-api-1
  sudo ls /etc/letsencrypt/live/ ; sudo test -e /etc/nginx/staging-store.htpasswd && echo 'htpasswd EXISTS' || echo 'htpasswd absent'
  sudo test -e /etc/nginx/snippets/cloudflare-real-ip.conf && echo 'snippet EXISTS' || echo 'snippet absent'
  ss -ltn | grep -E ':3001 ' || echo '3001 free'
  getent hosts staging-store.otakugalaxystore.com || echo 'no DNS yet'
)
```

Expected: compose ≥ 2.24 (long `env_file` syntax; older refuses the whole file), `staging` clean, at most one `BFF_SHARED_SECRET=`
line and it is empty, no store env file, API healthy on `staging-87ffeae`, no store certificate,
password file or snippet, 3001 free, no DNS yet.

### S2 — checkout to `X` (changes checkout files only; containers untouched)

```bash
( set -e
  cd /srv/otaku-galaxy/staging
  test "$(git rev-parse --abbrev-ref HEAD)" = staging
  git fetch origin
  git merge --ff-only origin/staging
  test "$(git rev-parse HEAD)" = X        # replace X with the full merged commit
  test -z "$(git status --porcelain)"
)
```

### S3 — secrets (nothing printed; values never leave the server)

```bash
( set -euo pipefail
  cd /srv/otaku-galaxy/staging
  umask 077
  B=backend/.env.staging W=web-store/.env.staging
  [ ! -e "$W" ] || { echo "STOP: $W exists"; exit 1; }
  [ "$(grep -c '^BFF_SHARED_SECRET=' "$B" || true)" -le 1 ] || { echo "STOP: several BFF lines"; exit 1; }
  ! grep -qE '^BFF_SHARED_SECRET=.+' "$B" || { echo "STOP: API already has a BFF secret"; exit 1; }
  cp -p "$B" "$B.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  BFF=$(openssl rand -hex 32)
  SEAL=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
  if grep -q '^BFF_SHARED_SECRET=$' "$B"; then
    BFF="$BFF" awk '/^BFF_SHARED_SECRET=$/ { print "BFF_SHARED_SECRET=" ENVIRON["BFF"]; next } { print }' "$B" > "$B.new"
    cat "$B.new" > "$B"; rm "$B.new"
  else
    printf 'BFF_SHARED_SECRET=%s\n' "$BFF" >> "$B"
  fi
  install -m 600 /dev/null "$W"
  { printf 'API_INTERNAL_URL=http://api:4000/api\n'
    printf 'MEDIA_ORIGIN=https://staging-api.otakugalaxystore.com\n'
    printf 'SITE_ORIGIN=https://staging-store.otakugalaxystore.com\n'
    printf 'SESSION_SEAL_KEYS=%s\n' "$SEAL"
    printf 'BFF_SHARED_SECRET=%s\n' "$BFF"; } > "$W"
  [ "$(sed -n 's/^BFF_SHARED_SECRET=//p' "$B")" = "$(sed -n 's/^BFF_SHARED_SECRET=//p' "$W")" ] || { echo "STOP: secrets differ"; exit 1; }
  ls -l "$B" "$W" "$B".bak-*
  test -z "$(git status --porcelain)"
)
```

The backup `backend/.env.staging.bak-<time>` and the store file are gitignored (`.env.*`) and
excluded from both Docker build contexts.

### S4 — recreate the API so it loads the secret (~10 s downtime, same image)

```bash
( set -euo pipefail
  cd /srv/otaku-galaxy/staging
  dc() { sudo env ENV_FILE=./backend/.env.staging HOST_PORT=4001 IMAGE_TAG=staging-87ffeae docker compose -p staging "$@"; }
  [ "$(sudo docker inspect --format '{{.Config.Image}}' staging-api-1)" = otaku-galaxy-api:staging-87ffeae ]
  dc up -d --no-build --no-deps --force-recreate api
  for i in $(seq 1 40); do s=$(sudo docker inspect --format '{{.State.Health.Status}}' staging-api-1); [ "$s" = healthy ] && break; sleep 3; done
  [ "$s" = healthy ]
  sudo docker inspect --format '{{.Config.Image}} restarts={{.RestartCount}}' staging-api-1
  curl -fsS localhost:4001/health; echo
  sudo docker logs --since 2m staging-api-1 2>&1 | grep -iE 'BFF_SHARED_SECRET|error|fatal' || echo 'no secret/startup errors'
)
```

`IMAGE_TAG=staging-87ffeae` is the image already running: the API code is unchanged by this branch.

### S5 — build and start the store on loopback (no DNS, no nginx yet)

```bash
( set -euo pipefail
  cd /srv/otaku-galaxy/staging
  test "$(git rev-parse HEAD)" = X        # replace X
  dc() { sudo env ENV_FILE=./backend/.env.staging HOST_PORT=4001 IMAGE_TAG=staging-$(git rev-parse --short HEAD) WEB_ENV_FILE=./web-store/.env.staging WEB_HOST_PORT=3001 docker compose -p staging --profile web "$@"; }
  dc build web
  dc up -d --no-build --no-deps web
  [ "$(dc port web 3000)" = 127.0.0.1:3001 ]
  for i in $(seq 1 40); do s=$(sudo docker inspect --format '{{.State.Health.Status}}' staging-web-1); [ "$s" = healthy ] && break; sleep 3; done
  sudo docker inspect --format 'web: {{.Config.Image}} health={{.State.Health.Status}}' staging-web-1
  [ "$s" = healthy ]
  curl -fsS -o /dev/null -w 'store / -> %{http_code}\n' http://127.0.0.1:3001/
  sudo docker inspect --format 'api still: {{.Config.Image}}' staging-api-1
  sudo docker logs staging-web-1 2>&1 | grep -iE 'required in production|error' || echo 'no config errors'
)
```

### S5b — store against the real staging API, on loopback (read-only)

```bash
( set -u
  S=http://127.0.0.1:3001
  echo "== container env: names only, and the two that must match"
  sudo docker exec staging-web-1 sh -c 'env | cut -d= -f1 | sort | tr "\n" " "'; echo
  sudo docker exec staging-web-1 sh -c 'test "$API_INTERNAL_URL" = http://api:4000/api && echo "API_INTERNAL_URL expected" || echo "API_INTERNAL_URL UNEXPECTED"'
  sudo docker exec staging-web-1 sh -c 'test "$SITE_ORIGIN" = https://staging-store.otakugalaxystore.com && echo "SITE_ORIGIN expected" || echo "SITE_ORIGIN UNEXPECTED"'
  echo "== api resolves to the staging API container"
  sudo docker exec staging-web-1 getent hosts api
  sudo docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' staging-api-1; echo
  echo "== no production API on this host"
  ss -ltn | grep -E ':4000 ' || echo 'nothing listens on 4000'
  echo "== catalog, product page, image"
  curl -sS -o /tmp/og-store-home.html -w 'home %{http_code}\n' $S/
  P=$(grep -oE 'href="/p/[^"]+"' /tmp/og-store-home.html | head -1 | cut -d'"' -f2)
  [ -n "$P" ] && curl -sS -o /dev/null -w "product $P %{http_code}\n" "$S$P" || echo 'no product link on home'
  I=$(grep -oE 'https://staging-api\.otakugalaxystore\.com/uploads/[^"?]+' /tmp/og-store-home.html | head -1)
  [ -n "$I" ] && curl -sS -o /dev/null -w "image %{http_code} %{content_type}\n" "$I" || echo 'no staging image URL on home'
  grep -c 'otakugalaxystore.com/uploads' /tmp/og-store-home.html
  rm -f /tmp/og-store-home.html
  echo "== CSRF: mutations from another origin, or with no origin, are refused"
  curl -sS -o /dev/null -w 'foreign Origin -> %{http_code}\n' -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' $S/bff/cart
  curl -sS -o /dev/null -w 'no Origin      -> %{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' $S/bff/cart
  echo "== store logs since start"
  sudo docker logs staging-web-1 2>&1 | tail -n 20 | cut -c1-200
)
```

Expected: no `DATABASE_URL`/`JWT_*` names in the store container; both values expected; `api`
resolves to an address of `staging-api-1`; nothing on 4000; home and product 200; the image URL is on
`staging-api.otakugalaxystore.com` and returns 200 `image/*`; both POSTs 403.

Isolation proof: create a clearly named test product in the staging dashboard and see it on the
store (`curl -s $S/ | grep -c '<name>'`, or a browser through `ssh -L 3001:127.0.0.1:3001 …`).

**Not testable on loopback, by design — moved to S9 (behind the tester password):** login, session,
cart and the test order. Every mutating `/bff/*` route requires `Origin` to equal `SITE_ORIGIN`
(`https://staging-store.otakugalaxystore.com`), and the session cookie is `Secure`; a browser on
`http://127.0.0.1:3001` sends a different `Origin` and is refused (the 403 above). Faking the
`Origin` header would test the API, not the deployment.

Known residual risk (no change proposed now): the store shares the project network with the API, so
TCP to the host PostgreSQL on `172.17.0.1:5432` is allowed by the existing ufw rule for
`172.18.0.0/16`. The database still requires the staging role's password, which the store container
does not have (env names above). Moving the store to its own network would need the API on two
networks, and the API's default gateway (its route to PostgreSQL through that ufw rule) would then
depend on Docker's network ordering — a change to verify separately, not in this deployment.

### S6 — DNS (owner, Cloudflare dashboard)

Add `staging-store` with the same record type(s) and origin address as `staging-api`, **proxied**.
Do not edit `otakugalaxystore.com` or any other record. Check: `getent hosts
staging-store.otakugalaxystore.com` returns Cloudflare addresses. Until S8, nginx answers this host
only through the default site (nothing of the store is reachable).

### S7 — certificate (temporary ACME-only site, as deploy §5)

```bash
( set -e
  DOMAIN=staging-store.otakugalaxystore.com
  getent hosts $DOMAIN
  if sudo test -e /etc/letsencrypt/live/$DOMAIN; then echo "STOP: certificate exists"; false; fi
  sudo tee /etc/nginx/sites-available/acme-$DOMAIN.conf >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
NGINX
  sudo ln -s /etc/nginx/sites-available/acme-$DOMAIN.conf /etc/nginx/sites-enabled/
  if sudo nginx -t; then
    sudo systemctl reload nginx
    sudo certbot certonly --webroot -w /var/www/certbot -d $DOMAIN --deploy-hook 'systemctl reload nginx' || true
  fi
  sudo rm /etc/nginx/sites-enabled/acme-$DOMAIN.conf
  sudo nginx -t
  sudo systemctl reload nginx
  sudo test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem
  echo CERT_OK
)
```

### S8 — password file, Cloudflare snippet, site (rollback on a failed `nginx -t`)

```bash
( set -e
  cd /srv/otaku-galaxy/staging
  test "$(git rev-parse --abbrev-ref HEAD)" = staging
  DOMAIN=staging-store.otakugalaxystore.com CONF=staging-store.conf
  sudo test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem
  # Tester login: openssl prompts twice for the password; it never reaches the shell history.
  sudo test ! -e /etc/nginx/staging-store.htpasswd
  H=$(openssl passwd -apr1)
  case "$H" in '$apr1$'*) ;; *) echo "STOP: no password hash"; false;; esac
  printf '%s:%s\n' tester "$H" | sudo tee /etc/nginx/staging-store.htpasswd >/dev/null
  sudo chown root:www-data /etc/nginx/staging-store.htpasswd
  sudo chmod 640 /etc/nginx/staging-store.htpasswd
  sudo test ! -e /etc/nginx/snippets/cloudflare-real-ip.conf
  sudo install -D -m 644 deploy/nginx/snippets/cloudflare-real-ip.conf /etc/nginx/snippets/cloudflare-real-ip.conf
  AV=/etc/nginx/sites-available/$CONF EN=/etc/nginx/sites-enabled/$CONF
  # One test per line: under `set -e` a failed command that is not the last of an
  # `a && b` list does not stop the block.
  sudo test ! -e "$AV"
  sudo test ! -e "$EN"
  sudo cp deploy/nginx/$CONF "$AV"
  sudo ln -s "$AV" "$EN"
  if sudo nginx -t; then
    sudo systemctl reload nginx
  else
    sudo rm "$EN" "$AV"
    echo "nginx -t failed — site removed, nothing reloaded"; false
  fi
)
```

Before running S8, re-fetch `https://www.cloudflare.com/ips-v4` and `/ips-v6` and compare with the
snippet; a changed list is a repo change first.

### S9 — acceptance (read-only except the test order)

```bash
U=https://staging-store.otakugalaxystore.com
curl -sS -o /dev/null -D - $U/ | grep -iE '^HTTP|x-robots|www-authenticate'      # 401, noindex
curl -sS -D - $U/robots.txt | grep -iE '^HTTP|x-robots|Disallow'                  # 200, Disallow: /
curl -sS -o /dev/null -w '%{http_code}\n' http://staging-store.otakugalaxystore.com/  # 301
```

Then in a browser with the tester password:

1. The catalog shows **staging** data (the S5b test product); product images load.
2. A **test customer** account (created and approved in `staging-admin` for this purpose, named so it
   is obviously a test) logs in; reloading keeps the session; logout ends it.
3. Add to cart, open checkout, place **one** cash-on-delivery order. It appears in `staging-admin`;
   reject it there with the reason «اختبار». No real customer account is used.
4. A cross-origin `POST /bff/cart` (other `Origin`) still gets 403 through nginx.

Real client IP — your own public IP must appear, not a Cloudflare address:

```bash
sudo tail -n 3 /var/log/nginx/staging-store.access.log | awk '{print $1}'
sudo docker logs --since 30m staging-api-1 2>&1 | grep -F '[client-ip]' || echo 'no client-ip warnings'
```

The API logs plain text (no structured levels), so read the last lines of both containers as well:
`sudo docker logs --since 30m staging-web-1 2>&1 | tail -n 40` and the same for `staging-api-1`.
Finally `getent hosts otakugalaxystore.com` is unchanged (no record today).

## 4. Rollback (each its own decision)

- Store off the internet: `sudo rm /etc/nginx/sites-enabled/staging-store.conf && sudo nginx -t &&
  sudo systemctl reload nginx` (file in `sites-available` kept).
- Store stopped: `sudo env ENV_FILE=./backend/.env.staging HOST_PORT=4001 IMAGE_TAG=staging-<X short>
  WEB_ENV_FILE=./web-store/.env.staging WEB_HOST_PORT=3001 docker compose -p staging --profile web
  stop web` from the checkout (container and image kept).
- The API secret can stay: with no store sending signed headers it changes nothing.
- Password file and snippet (`/etc/nginx/staging-store.htpasswd`, `/etc/nginx/snippets/cloudflare-real-ip.conf`)
  are only read by the store site; removing them is a separate cleanup decision.
- DNS record: remove in Cloudflare.

## 5. Out of scope

Production storefront (no nginx file, no decision), HSTS on the store, Cloudflare Access instead of
basic auth, the admin dashboard `dist` update (separate step), cleanup of rehearsal artifacts.
