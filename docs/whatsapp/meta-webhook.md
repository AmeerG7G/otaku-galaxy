# WhatsApp Cloud API webhook (Meta)

Inbound half of WhatsApp sign-up verification (`WHATSAPP_VERIFY_MODE=auto`).
Off by default; production refuses to boot with anything but `off`. The manual
registration form + admin approval path is unchanged in both modes.

Code: `backend/src/routes/whatsappWebhook.ts` (HTTP),
`backend/src/services/whatsapp/metaWebhook.ts` (signature + payload parsing, pure),
`backend/src/services/whatsapp/provider.ts` (handshake, provider switch),
`backend/src/services/whatsappSignupService.ts` → `handleInboundEvent` / `processEvent`
(session matching). Tables: `whatsapp_signup_sessions` (093),
`whatsapp_webhook_events` (094, dedupe), `whatsapp_outbox` (095).

## Endpoint

`/api/webhooks/whatsapp` — mounted in `app.ts` **before** `express.json`, before the
global limiter, outside `authenticate`. Own limiter: 600 req/min per client key.

| Method | Purpose | Responses |
|---|---|---|
| `GET` | Meta subscription handshake | `200 text/plain <hub.challenge>` only when `hub.mode=subscribe`, `hub.verify_token` equals `WHATSAPP_VERIFY_TOKEN` (constant-time, hashed compare), and `hub.challenge` matches `^[\w-]{1,128}$`. Anything else, or no token configured: `403 forbidden`. Works in `off` too, so the callback can be registered before verification is switched on. |
| `POST` | Event delivery | `401` bad/missing `X-Hub-Signature-256` (checked on the raw bytes before any parsing) · `413` body > 256 KB · `200` accepted (including ignored, duplicate, malformed-but-signed) · `500` a transient failure (e.g. DB) in any event, so Meta redelivers. |

Responses never carry error details or stack traces.

## Security model

- **Signature:** `HMAC-SHA256(WHATSAPP_APP_SECRET, rawBody)` compared with
  `timingSafeEqual`. The body is read with `express.raw` for this route only; JSON is
  parsed only after the signature passes. Empty app secret ⇒ every POST is 401.
- **Validation:** payload must be `object: whatsapp_business_account`, `field: messages`;
  events from another `phone_number_id` than `WHATSAPP_PHONE_NUMBER_ID` are dropped.
  Messages without an id or a numeric timestamp are ignored.
- **Status updates** (`value.statuses[]`: sent/delivered/read/failed) are never treated
  as customer messages — they produce no event row and touch no session.
- **Sender phone:** taken only from `messages[].from` / `contacts[].wa_id` and only when
  it is 7–15 digits. A BSUID (`from_user_id`, e.g. `IQ.…`), username or any other shape
  is treated as *phone unavailable* — it is never compared to a session phone and never
  counts as a wrong-sender attempt. A lone `contacts[]` profile is borrowed only if it
  does not contradict the message's own sender id/phone.
- **Phone unavailable** (username users): if a BSUID is present the session moves to
  `awaiting_contact` and a `request_contact_info` button is queued; only a reply with
  `origin: contact_request`, exactly one contact and one numeric `wa_id` can verify.
  No BSUID and no phone ⇒ outcome `no_sender`, session untouched.
- **Idempotency:** each event is its own transaction that first inserts
  `(provider, event_id)` into `whatsapp_webhook_events` with `ON CONFLICT DO NOTHING`;
  redeliveries (sequential or concurrent) return `duplicate` with no effect. A failed
  event rolls back, so its retry is processed normally.
- **Logging:** outcome codes only (`text → verified`), masked phones, pg error codes.
  Never the body, message text, code, tokens, app secret or passwords.
- **What the webhook cannot do:** create an account or set a password. It only moves a
  session `pending → verified` (or `awaiting_contact`). The account is created by
  `POST /api/auth/register/whatsapp/complete`, authorised by the session secret held by
  the client that started the session.

## How a message reaches the right session

1. The app calls `start {phone}` and receives `sessionId`, a one-time `secret`, and a
   code `OG-XXXXX-XXXXX` (only HMAC hashes are stored).
2. The customer sends the code to the business number from **any** device. The webhook
   finds the session by the code's hash — no device, IP or app identity is involved.
3. The sender's number must equal the session's phone; otherwise it is a wrong-sender
   attempt on *that* session (third one kills it). Another session is never touched.
4. Only the holder of that session's `secret` can `complete`. A secret from another
   session gets 404.

A parent can register a child: the session phone is the parent's WhatsApp number, the
parent sends the code from their phone, and the child's device completes with its own
username. The one-account-per-phone rule still applies.

## Environment variables

Names only — real values never enter Git. Templates: `backend/.env*.example`.

| Variable | Required when | Notes |
|---|---|---|
| `WHATSAPP_VERIFY_MODE` | always | `off` (default) \| `auto`. Production refuses `auto` at boot. |
| `WHATSAPP_PROVIDER` | auto | `meta` in staging/prod (`fixture` refused there); `fixture` default in dev/test. |
| `WHATSAPP_APP_SECRET` | auto + meta | Meta App → Settings → Basic → App secret. HMAC key for `X-Hub-Signature-256`. |
| `WHATSAPP_VERIFY_TOKEN` | auto + meta (and for the handshake) | Random string you choose (`openssl rand -hex 32`); typed into Meta as *Verify token*. |
| `WHATSAPP_ACCESS_TOKEN` | auto + meta | System-user token, outbound replies only. |
| `WHATSAPP_PHONE_NUMBER_ID` | auto + meta | Also filters inbound events to this number. |
| `WHATSAPP_BUSINESS_NUMBER` | auto | E.164 `+9647…`, shown to customers. |
| `WHATSAPP_TOKEN_PEPPER` | auto | ≥ JWT minimum length; `openssl rand -hex 32`. |
| `WHATSAPP_GRAPH_API_VERSION` | optional | default `v23.0`. |

## Environments

- **Local dev / tests:** provider `fixture` with a labelled dev app secret; nothing is
  sent or received from Meta. Tests sign payloads with `signMetaPayload`. Meta cannot
  reach `localhost`; a tunnel would be needed for a real handshake and is not set up.
- **Staging:** the only place a real Meta callback should point. See below.
- **Production:** `WHATSAPP_VERIFY_MODE` must stay `off`; the boot check enforces it.
  The route is mounted there too; with no `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET`
  set, the handshake answers 403 and every POST 401. In `off`, signed events are
  accepted and dropped.

## Staging status (checked 2026-11-15, read-only)

Repo config agrees on the staging API host: `lib/core/config/app_config.dart`,
`admin/.env.staging.example`, `backend/.env.staging.example`
(`PUBLIC_BASE_URL=https://staging-api.otakugalaxystore.com`). A read-only probe showed
DNS (Cloudflare), valid TLS and `GET /health → 200`, but
`GET /api/webhooks/whatsapp → 401 UNAUTHORIZED` — the same answer as any unknown route,
i.e. **this webhook is not deployed on staging**. `deploy/nginx/staging-api.conf` in the
repo still uses the placeholder `staging-api.example.com`, so the live nginx config is
not in Git.

Intended callback URL once deployed:
`https://staging-api.otakugalaxystore.com/api/webhooks/whatsapp` — **not yet valid**.

Still needed before Meta can verify it:

1. Merge and deploy this branch to staging, and apply migrations 093–095 there.
2. Staging `.env`: `WHATSAPP_PROVIDER=meta` plus all variables above with real values;
   keep `WHATSAPP_VERIFY_MODE=off` until the handshake and a signed test event succeed.
3. Confirm `GET …/api/webhooks/whatsapp` without parameters returns `403 forbidden`
   (proves the new route is live).
4. Cloudflare: make sure WAF / Bot Fight Mode does not challenge Meta's POSTs to this
   path, and that nothing rewrites the request body (it would break the signature).
5. In the Meta App dashboard (owner): WhatsApp → Configuration → Callback URL = the
   URL above, Verify token = staging `WHATSAPP_VERIFY_TOKEN`, then subscribe the
   `messages` field.
6. Only then switch staging to `auto` and pilot with real numbers, including a
   username (BSUID-only) account to confirm the `contact_request` payload shape.
