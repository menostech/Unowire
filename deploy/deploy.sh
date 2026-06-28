#!/usr/bin/env bash
# Unowire deployment script — run on the production server.
# Usage: ./deploy/deploy.sh [branch]
#   branch defaults to "master"
#
# Prerequisites:
#   - Node.js 20+ installed
#   - PM2 installed globally (npm install -g pm2)
#   - Nginx installed
#   - Repository cloned to /var/www/unowire
#   - frontend/.env.production present
#
# What this script does:
#   1. Pull latest code from the given branch
#   2. Install npm dependencies (npm ci)
#   3. Build Next.js (npm run build, includes prebuild data validation)
#   4. Reload PM2 process (zero-downtime reload)
#   5. Reload Nginx (config may have changed)

set -euo pipefail

BRANCH="${1:-master}"
APP_DIR="/var/www/unowire"
FRONTEND_DIR="$APP_DIR/frontend"

echo "==> [1/5] Pulling latest code from branch: $BRANCH"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> [2/5] Installing npm dependencies"
cd "$FRONTEND_DIR"
npm ci

echo "==> [3/5] Building Next.js (with prebuild data validation)"
npm run build

echo "==> [4/5] Reloading PM2 process (zero-downtime)"
pm2 reload ecosystem.config.cjs --update-env
pm2 save

echo "==> [5/5] Reloading Nginx"
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "==> Deployment complete."
echo "    Site: https://www.unowire.com"
echo "    PM2 status: pm2 status"
echo "    PM2 logs:   pm2 logs unowire-frontend --lines 50"
