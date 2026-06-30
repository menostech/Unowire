# Docker Deployment Design Spec

**Date**: 2026-06-30
**Phase**: Replaces PM2/manual deployment in FastAPI Backend Spec Section 7
**Status**: Draft

## 1. Overview

Replace the PM2 + manual installation deployment with Docker Compose. All services (Nginx, Frontend, Backend, PostgreSQL) run in containers. Local development also uses Docker Compose for a unified environment.

### Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Local dev | Docker Compose (same as prod) | Unified environment, no local PG/Python install needed |
| Nginx | Docker container | All services in Docker, single docker-compose up |
| SSL termination | Host Nginx + certbot | Certbot stays on host for simplicity; Docker Nginx does internal routing |
| PG data | Docker named volume | Simple, Docker-managed |
| Deploy flow | Server build (git pull + docker compose build + up) | Simplest for MVP, no CI/CD or registry |
| Network | Single Docker bridge network (unowire-net) | Services communicate via Docker DNS |

## 2. Architecture

### System Architecture (Production)

```
Internet → Host Nginx (443 SSL / 80 HTTP→HTTPS redirect)
              │ certbot on host, certs mapped to host Nginx
              ↓ proxy_pass 127.0.0.1:8080
           Docker Nginx container (port 8080 mapped → 80)
              ├── /            → Frontend container (port 3000)
              ├── /api/        → Backend container (port 8000)
              └── /sitemap.xml, /robots.txt → Frontend container

           Docker Network: unowire-net
           Backend container (8000) → DB container (5432)
           DB container: no port exposed to host (production)
```

### System Architecture (Development)

```
Developer machine
  docker compose up
    ├── Nginx container (http://localhost:8080)
    ├── Frontend container (next dev, hot reload, source mounted)
    │     ↕ fetch /api/ → Nginx → Backend
    ├── Backend container (uvicorn --reload, source mounted)
    │     → DB container (5432 exposed to localhost:5432)
    └── DB container (pgdata volume)
```

### Container Communication

All services on the `unowire-net` Docker bridge network:
- Nginx → frontend:3000 (internal)
- Nginx → backend:8000 (internal)
- Backend → db:5432 (internal)
- Frontend → does NOT access db directly

Backend `DATABASE_URL` inside container: `postgresql+asyncpg://unowire:xxx@db:5432/unowire`

## 3. File Structure

### New files

| File | Responsibility |
|---|---|
| `docker-compose.yml` | Production service definitions (4 services) |
| `docker-compose.override.yml` | Dev overrides (hot reload, port exposure, source mounts) |
| `frontend/Dockerfile` | Multi-stage Next.js build (standalone output) |
| `backend/Dockerfile` | Multi-stage FastAPI build |
| `deploy/nginx/Dockerfile` | Internal Nginx image build |
| `deploy/nginx/nginx.conf` | Internal Nginx reverse proxy config (replaces nginx-unowire.conf) |
| `.env.docker` | Docker environment variable template |
| `deploy/host-nginx.conf` | Host Nginx config (SSL termination only, replaces certbot-modified config) |

### Deleted files

| File | Reason |
|---|---|
| `frontend/ecosystem.config.cjs` | PM2 no longer used |
| `deploy/nginx-unowire.conf` | Replaced by deploy/nginx/nginx.conf (internal) + deploy/host-nginx.conf (host) |

### Modified files

| File | Change |
|---|---|
| `deploy/deploy.sh` | Rewrite for Docker Compose flow |
| `deploy/README.md` | Update for Docker deployment |
| `.gitignore` | Add Docker-related entries |
| `frontend/next.config.ts` | Add `output: "standalone"` for Docker optimization |
| `frontend/.env.production` | Remove NEXT_PUBLIC_API_MODE=mock |

## 4. Docker Compose Services

### docker-compose.yml (production base)

```yaml
services:
  nginx:
    build:
      context: ./deploy/nginx
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    depends_on:
      - frontend
      - backend
    networks:
      - unowire-net
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
    env_file:
      - ./frontend/.env.production
    networks:
      - unowire-net
    restart: unless-stopped

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - DATABASE_URL=postgresql+asyncpg://unowire:${DB_PASSWORD}@db:5432/unowire
    depends_on:
      db:
        condition: service_healthy
    networks:
      - unowire-net
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=unowire
      - POSTGRES_USER=unowire
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - unowire-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U unowire"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:

networks:
  unowire-net:
    driver: bridge
```

### docker-compose.override.yml (development, auto-merged)

```yaml
services:
  frontend:
    build:
      target: development
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
    command: npm run dev

  backend:
    build:
      target: development
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://unowire:unowire_dev@db:5432/unowire
      - DEBUG=true
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  db:
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_PASSWORD=unowire_dev
```

## 5. Dockerfiles

### frontend/Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# Stage 3: Development
FROM node:20-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

**Requirement**: `next.config.ts` must set `output: "standalone"` for the production stage to work.

### backend/Dockerfile

```dockerfile
# Stage 1: Builder
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Stage 2: Production
FROM python:3.12-slim AS production
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app .
EXPOSE 8000
CMD ["gunicorn", "app.main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000"]

# Stage 3: Development
FROM python:3.12-slim AS development
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### deploy/nginx/Dockerfile

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## 6. Nginx Configuration

### deploy/nginx/nginx.conf (Docker internal)

Internal Nginx that routes between frontend and backend containers:

```nginx
server {
    listen 80;
    server_name _;

    # Static asset caching (Next.js _next/static path)
    location /_next/static/ {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # FastAPI backend
    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # Next.js frontend (all other routes)
    location / {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
    gzip_proxied any;

    client_max_body_size 10m;
}
```

### deploy/host-nginx.conf (Host SSL termination)

Minimal host Nginx config — only SSL termination, then proxy to Docker Nginx:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name www.unowire.com unowire.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS → Docker Nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.unowire.com unowire.com;

    # SSL certificates (managed by certbot)
    # certbot will add: ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
    #                   ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 7. Environment Variables

### .env.docker (template, committed to repo)

```
# PostgreSQL
DB_PASSWORD=CHANGE_ME_IN_PRODUCTION

# Backend
DATABASE_URL=postgresql+asyncpg://unowire:${DB_PASSWORD}@db:5432/unowire
DEBUG=false
```

### Environment variable flow

| Variable | Where | Used by |
|---|---|---|
| `DB_PASSWORD` | .env.docker → docker-compose.yml | PostgreSQL container, Backend container |
| `DATABASE_URL` | docker-compose.yml environment | Backend container (overrides config.py default) |
| `NODE_ENV` | docker-compose.yml environment | Frontend container |
| `NEXT_PUBLIC_SITE_URL` | frontend/.env.production | Frontend (build time) |
| `DEBUG` | docker-compose.yml / override | Backend container |

Dev override sets: `DB_PASSWORD=unowire_dev`, `DATABASE_URL=...@db:5432/unowire`, `DEBUG=true`

## 8. Deployment Flow

### First-time server setup

```bash
# 1. Install Docker + Docker Compose
# 2. Clone repository
git clone <REPO_URL> /var/www/unowire
cd /var/www/unowire

# 3. Create .env from template
cp .env.docker .env
# Edit .env: set DB_PASSWORD

# 4. Build and start
docker compose build
docker compose up -d

# 5. Run migrations and seed
docker compose exec backend alembic upgrade head
docker compose exec backend python -m scripts.seed

# 6. Configure host Nginx for SSL
sudo cp deploy/host-nginx.conf /etc/nginx/sites-available/unowire
sudo ln -sf /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
sudo nginx -t && sudo systemctl reload nginx

# 7. Run certbot
sudo certbot --nginx -d www.unowire.com -d unowire.com
```

### Subsequent deploys

```bash
cd /var/www/unowire
git pull origin master
docker compose build
docker compose up -d --remove-orphans
docker compose exec backend alembic upgrade head
```

### deploy/deploy.sh (rewritten)

```bash
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
```

### Rollback

```bash
cd /var/www/unowire
git log --oneline -10           # find last good commit
git checkout <GOOD_COMMIT_HASH>
docker compose build
docker compose up -d --remove-orphans
```

## 9. Development Workflow

### Local development

```bash
# Start all services (docker-compose.override.yml is auto-merged)
docker compose up

# Access:
#   Frontend: http://localhost:3000 (hot reload)
#   Backend:  http://localhost:8000 (hot reload, Swagger at /api/docs)
#   Nginx:    http://localhost:8080 (production-like routing)
#   Database: localhost:5432 (pgAdmin / DBeaver)

# Run migrations
docker compose exec backend alembic upgrade head

# Seed data
docker compose exec backend python -m scripts.seed

# Stop
docker compose down

# Stop + remove data
docker compose down -v
```

### Frontend-only development (without Docker)

Frontend can still run standalone with `npm run dev` using static JSON data (no backend needed). The Docker setup is for when you need the full stack.

## 10. Scope Boundaries

### In Scope

- Docker Compose configuration (4 services)
- Dockerfiles for frontend, backend, Nginx
- Internal Nginx reverse proxy config
- Host Nginx SSL termination config
- Development override (hot reload, source mounts, port exposure)
- deploy.sh rewrite for Docker flow
- .env.docker template
- next.config.ts standalone output
- deploy/README.md update
- .gitignore Docker entries

### Out of Scope

- CI/CD pipeline
- Docker image registry
- Kubernetes or orchestration beyond Docker Compose
- Multi-host deployment
- Automated database backup (manual pg_dump)
- Container monitoring / observability
