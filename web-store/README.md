# Otaku Galaxy web store (`web-store/`)

The customer website: Arabic, right-to-left, mobile-first from 320px up to desktop. It opens straight on the catalog. There is no welcome or landing page, and there is no character artwork; the only images are product images from the API.

It is a thin **backend-for-frontend (BFF)** over the existing API (`backend/`):

- The **same catalog, cart, prices, discounts and orders** as the mobile app. The cart is the server cart, so it is shared between the app and the site.
- The **same accounts**:
  - Registration and forgotten passwords are *requests the admin approves* (WhatsApp check). There is no SMS and no code.
  - Admin accounts cannot sign in here.
- Cash on delivery only. Customers have no cancellation action; the admin rejects an order with a reason, as in the app.

```
browser ──(same-origin, HttpOnly cookie)──▶ Next.js server ──(Bearer JWT, signed shopper IP)──▶ API
```

The browser never calls the API and never sees the JWT.

## Run locally

Requires Node 22 and a running local API (`backend/`, `npm run dev`) with dev data (`npm run db:migrate && npm run db:seed`).

```bash
cd web-store
npm ci
cp .env.example .env.local   # fill in values for your machine; never commit it
npm run dev                  # http://127.0.0.1:3000
```

| Variable | Purpose |
|---|---|
| `API_INTERNAL_URL` | The API as reached from this server (loopback or a private network), e.g. `http://127.0.0.1:4000/api`. |
| `MEDIA_ORIGIN` | Public origin that serves `/uploads/...` to browsers (the API's public host). |
| `SITE_ORIGIN` | Canonical public origin, e.g. `https://otakugalaxystore.com`. Mutating `/bff/*` requests are accepted only from this `Origin`. |
| `SESSION_SEAL_KEYS` | Comma-separated 32-byte keys (base64url) that seal the session cookie. The first one seals; all of them open, which allows rotation. **Required in production.** |
| `BFF_SHARED_SECRET` | The same value as the API's `BFF_SHARED_SECRET`. It signs the shopper's IP so the API's rate limits stay per shopper. **Required in production.** |
| `CSP_EXTRA_IMG_ORIGINS` | Optional extra image origins for the CSP, e.g. `https://placehold.co` for the dev seed. |

All variables are server-only (no `NEXT_PUBLIC_`). They are read on the first request, so `npm run build` needs none of them.

## Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs exactly these (`.github/workflows/ci.yml`, job `web-store`).

**End to end (Playwright).** These run against a production build and a real local API; nothing is mocked:

```bash
npm run build && npm start &                  # with the variables above
SEED_ADMIN_PHONE=… SEED_ADMIN_PASSWORD=… npm run e2e
```

The setup creates a fresh customer through the real request → admin-approval path. The suite covers:

- **Viewports.** 320, 360, 390, 414, 768, 1024, 1280 and 1440px:
  - no horizontal scrolling, and touch targets of at least 44px;
  - no CSP violations;
  - no app artwork, and no landing page.
- **Purchase flow.** Browse → login → cart → checkout → order.
  - It includes a **lost response**: the order is still created exactly once.
  - It includes a **cart change after review**, which the API refuses with `QUOTE_CHANGED`.
- **Security.**
  - CSRF: other origins get 403.
  - Admin isolation, and no proxying of other API paths.
  - Open-redirect guard.
  - Cookie flags: `HttpOnly`, `SameSite=Lax`, and the JWT is absent from the HTML.
  - Nonce CSP on every script.
  - Per-shopper login limits through the BFF.

Screenshots land in `test-results/screens/`. This is browser emulation; see the manual checklist in `PROJECT_FEATURE_SPEC.md` for real-device QA.

## Security model

- **Session.**
  - The API's JWT is sealed with AES-256-GCM inside `__Host-og_session` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`).
  - A new cookie is minted at every login, which prevents fixation.
  - The cookie expires with the JWT.
  - Logout drops the cookie. *The API has no per-token revocation yet*: a password change or suspension still revokes every token.
- **CSRF.** Every mutating `/bff/*` route requires `Origin == SITE_ORIGIN`, or `Sec-Fetch-Site: same-origin` when `Origin` is absent. Anything else is refused.
- **Allowlist.** Only the customer endpoints the site needs are exposed under `/bff/*`. Nothing proxies arbitrary API paths, and `/api/admin` is unreachable from the website.
- **Orders.**
  - Every checkout carries an `Idempotency-Key`, so a retry returns the same order.
  - It also carries the quote's fingerprint (`expectedQuote`): the order is created exactly as reviewed, or refused.
  - The website never computes totals.
- **Headers.**
  - A per-request nonce CSP (`src/proxy.ts`).
  - `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and `COOP`.
  - HSTS comes from nginx once HTTPS is verified on the domain.

## Deployment notes (not done in this phase)

- Run `npm start`. It listens on **127.0.0.1:3000 only**, behind nginx.
- nginx must:
  - set `proxy_set_header X-Real-IP $remote_addr;` (the shopper IP that gets signed to the API);
  - redirect `www.otakugalaxystore.com` to `https://otakugalaxystore.com`;
  - send HSTS.
- If Cloudflare is put in front, nginx needs `real_ip` configuration for Cloudflare's ranges first. Otherwise every shopper appears as a Cloudflare address.
- Set the same `BFF_SHARED_SECRET` on the API and here. Use a different secret per environment.

## Not included yet

- Push notifications (deferred by decision).
- Kurdish (later).
- Profile and password editing (the app or the admin handles these).
- Favourites, reviews and points.
