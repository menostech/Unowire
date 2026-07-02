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
docker compose -f docker-compose.yml build

echo "==> [3/4] Running database migrations"
docker compose -f docker-compose.yml up -d db backend
echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.yml exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" 2>/dev/null; then
    break
  fi
  sleep 2
done
docker compose -f docker-compose.yml exec -T backend alembic upgrade head
docker compose -f docker-compose.yml exec -T backend python -m scripts.seed

echo "==> [4/4] Starting all services (graceful restart)"
docker compose -f docker-compose.yml up -d --remove-orphans

echo ""
echo "==> Deployment complete."
echo "    Site: https://www.unowire.com"
echo "    Status: docker compose -f docker-compose.yml ps"
echo "    Logs:   docker compose -f docker-compose.yml logs --tail=50"
