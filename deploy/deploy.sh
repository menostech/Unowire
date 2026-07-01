#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1:-master}"
APP_DIR="/var/www/unowire"

echo "==> [1/4] Pulling latest code from branch: $BRANCH"
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> [2/4] Building Docker images"
docker compose build

echo "==> [3/4] Starting services (graceful restart)"
docker compose up -d --remove-orphans

echo "==> [4/4] Running database migrations"
docker compose exec backend alembic upgrade head

echo ""
echo "==> Deployment complete."
echo "    Site: https://www.unowire.com"
echo "    Status: docker compose ps"
echo "    Logs:   docker compose logs --tail=50"
