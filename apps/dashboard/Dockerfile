# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Next.js dashboard.
# Build context MUST be the monorepo root:
#
#   docker build -f apps/dashboard/Dockerfile -t spw-dashboard .
#
# NEXT_PUBLIC_API_URL is baked into the client bundle at build time, so
# the build arg must match the API URL the browser will actually hit. For
# local docker compose that's http://localhost:3001; for production it's
# your public API host.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /workspace

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/widget/package.json apps/widget/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY packages/shared packages/shared
COPY apps/dashboard apps/dashboard
RUN pnpm --filter @spw/shared build \
 && pnpm --filter @spw/dashboard build

# Runtime uses the Next.js `output: 'standalone'` bundle so node_modules
# is already pruned to exactly what the server needs.
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini curl \
 && addgroup -S spw && adduser -S -G spw spw
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=spw:spw /workspace/apps/dashboard/public ./public
COPY --from=build --chown=spw:spw /workspace/apps/dashboard/.next/standalone ./
COPY --from=build --chown=spw:spw /workspace/apps/dashboard/.next/static ./.next/static

# pnpm standalone output uses symlinks that break in multi-stage copies.
# Install the minimal runtime deps Next.js needs with npm instead.
RUN npm install --no-save next@14.1.4 2>/dev/null && chown -R spw:spw node_modules

USER spw
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
