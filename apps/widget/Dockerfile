# syntax=docker/dockerfile:1.7
#
# Build + static-host the embeddable widget (IIFE/ES/UMD bundles).
# In production you'd typically push these to a CDN; this image exists so a
# self-hosted deploy can `docker compose up` without a separate CDN.
# Build context MUST be the monorepo root:
#
#   docker build -f apps/widget/Dockerfile -t spw-widget .

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
COPY apps/widget apps/widget
RUN pnpm --filter @spw/widget build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /workspace/apps/widget/dist /usr/share/nginx/html
# Widget scripts are loaded cross-origin by tenant WordPress/site pages, so
# we allow any origin to GET them — this is a public CDN-style asset server.
RUN printf 'server {\n  listen 80;\n  location / {\n    add_header Access-Control-Allow-Origin "*";\n    add_header Cache-Control "public, max-age=86400";\n    try_files $uri $uri/ =404;\n  }\n  location = /healthz { access_log off; return 200 "ok"; }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
