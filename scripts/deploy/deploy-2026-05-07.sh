#!/bin/bash
# Deploy: AI settings tab, migration fixes, super-admin email verify, PM2 config
# Date: 2026-05-07
set -e

cd /var/www/vhosts/spw-ai.com/spw

echo "=== 1. Pull latest ==="
git pull origin main

echo "=== 2. Install dependencies ==="
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "=== 3. Build API + Dashboard ==="
pnpm --filter api build
pnpm --filter dashboard build

echo "=== 4. Run migrations ==="
npx typeorm migration:run -d apps/api/dist/config/database.config.js

echo "=== 5. Restart all services ==="
pm2 restart ecosystem.config.js --env production

echo "=== 6. Verify ==="
pm2 status
echo ""
echo "Done! Check:"
echo "  - Dashboard Settings → AI tab visible"
echo "  - AI translation works after adding OpenRouter key"
echo "  - New clients get emailVerifiedAt set on creation"
