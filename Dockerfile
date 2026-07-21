# syntax=docker/dockerfile:1
# Production WEB image — Next.js standalone (Phase 3D) + BuildKit caches (Phase 3E).

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# Dependency layer — invalidated only when lockfile/package.json change.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
# Source copy before build-args so ARG changes do not bust the source layer.
COPY . .

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_RECAPTCHA_ENABLED=false

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY \
    NEXT_PUBLIC_RECAPTCHA_ENABLED=$NEXT_PUBLIC_RECAPTCHA_ENABLED \
    NEXT_TELEMETRY_DISABLED=1

RUN chmod +x scripts/docker-check-build-env.sh \
  && scripts/docker-check-build-env.sh \
  && pnpm run build \
  && test -f .next/standalone/server.js \
  && test -d .next/standalone/node_modules \
  && test -d .next/static \
  && test -d public

# Minimal runtime: standalone + healthcheck + volume entrypoint only.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# wget  — HEALTHCHECK /api/health
# su-exec — drop privileges after volume chown (entrypoint)
# procps — NOT installed (web healthcheck is HTTP, not pgrep)
RUN apk add --no-cache wget su-exec \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Next vendors node-tar only for build-time SWC download. Strip it from the runtime
# image so image scans do not fail on CVE-2026-59873 / CVE-2026-59874 until Next bumps it.
RUN find /app -type d -path '*/next/dist/compiled/tar' -prune -exec rm -rf {} +

RUN mkdir -p /app/public/uploads /app/storage/reconciliation /app/data \
  && chown -R nextjs:nodejs /app/public/uploads /app/storage/reconciliation /app/data

COPY scripts/docker-entrypoint-web.sh /docker-entrypoint-web.sh
RUN chmod 755 /docker-entrypoint-web.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/docker-entrypoint-web.sh"]
CMD ["node", "server.js"]
