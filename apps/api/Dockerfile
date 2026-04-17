# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the NestJS API.
# Build context MUST be the monorepo root (we need pnpm-workspace.yaml and
# the @spw/shared package):
#
#   docker build -f apps/api/Dockerfile -t spw-api .
#
# Runtime expects a MySQL + Redis reachable at REDIS_HOST / DATABASE_HOST.
# See .env.production.example at the repo root for required envs.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /workspace

# -------- deps: fetch all workspace deps, leverage a pnpm store cache --------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/widget/package.json apps/widget/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# -------- build: compile @spw/shared and then the api --------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @spw/shared build \
 && pnpm --filter api build
# `pnpm deploy` produces a self-contained deployment dir with only prod
# dependencies, so the runtime image stays small without pulling in Jest,
# ts-node, TypeScript etc.
RUN pnpm --filter api --prod deploy /out
# Belt-and-braces: pnpm deploy copies the package folder minus dev node_modules,
# which includes `dist/`. Re-sync explicitly in case the deploy version changes
# that behavior — using cp -f into a dotted source to merge without nesting.
RUN rm -rf /out/dist && cp -r apps/api/dist /out/dist

# -------- runtime: minimal node image, non-root user, tini init --------
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini curl \
 && addgroup -S spw && adduser -S -G spw spw
WORKDIR /app
COPY --from=build --chown=spw:spw /out/node_modules ./node_modules
COPY --from=build --chown=spw:spw /out/dist ./dist
COPY --from=build --chown=spw:spw /out/package.json ./package.json

# Uploads persisted on a named volume in compose; create the mount point so
# the ServeStaticModule has somewhere to look on first boot.
RUN mkdir -p /app/uploads && chown -R spw:spw /app/uploads

USER spw
EXPOSE 3001
ENV NODE_ENV=production \
    API_BIND_HOST=0.0.0.0 \
    PORT=3001

# Liveness only — /live doesn't probe DB/Redis, so a transient dep outage
# won't trigger a restart loop. For "should this replica receive traffic?",
# an external load balancer should hit /api/health/ready instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/api/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
