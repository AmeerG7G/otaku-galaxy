# syntax=docker/dockerfile:1

# ==============================================================================
# Otaku Galaxy web storefront — multi-stage image (compose service `web`).
#
#   • `builder` installs everything and runs `next build`.
#   • `runtime` carries production dependencies and `.next/` only.
#
# One image serves staging and production. Nothing environment-specific is
# baked in: `src/lib/config.ts` reads every value lazily at request time, so
# `next build` needs no secrets, and the values arrive from the compose
# `env_file` when the container starts. `.dockerignore` keeps every `.env*`
# file out of the build context.
# ==============================================================================

# The version CI uses (`.github/workflows/ci.yml`, web store job).
ARG NODE_VERSION=22

# ---------- build ----------
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first, so a code change keeps the npm layer cached.
# `.npmrc` matters: without legacy-peer-deps, `npm ci` crashes (see the file).
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY next.config.ts tsconfig.json ./
COPY src ./src

# The build cache is only useful to the next build on this machine; it stays
# out of the runtime image.
RUN npm run build && rm -rf .next/cache

# ---------- runtime ----------
FROM node:${NODE_VERSION}-alpine AS runtime

# dumb-init is PID 1 and forwards SIGTERM, so `next start` shuts down cleanly
# instead of being SIGKILLed after the grace period.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

# Only `.next` is the server's to write (its runtime cache); dependencies and
# config stay root-owned and read-only to the `node` user. A `chown -R /app`
# here duplicated every dependency file into another layer.
COPY --from=builder --chown=node:node /app/.next ./.next
COPY next.config.ts ./

USER node

EXPOSE 3000

# Healthy means the store renders its home page, which reads the API: a
# container that is up but cannot reach the API (or lacks a required variable
# and throws on every request) is reported unhealthy, not healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]

# All interfaces inside the container: the container is network-isolated and
# compose publishes the port on the host's loopback only, behind nginx.
# (`npm start` keeps `-H 127.0.0.1` for the non-container path.)
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
