# Unowire Deployment Guide

Production deployment for the Unowire platform at **www.unowire.com**.

## Architecture

```
Internet → Host Nginx (443/HTTPS) → Docker Nginx (80) → frontend (3000) / backend (8000)
                                                          └→ PostgreSQL (5432)
```

Four-container Docker Compose stack:

| Service  | Image              | Role                                                    |
|----------|--------------------|---------------------------------------------------------|
| nginx    | custom (nginx:alpine) | Container reverse proxy, routes `/api/` and `/media/` to backend, everything else to frontend |
| frontend | custom (node:20-alpine) | Next.js 16 standalone server                         |
| backend  | custom (python:3.12-slim) | FastAPI + gunicorn (4 uvicorn workers)            |
| db       | postgres:16-alpine | PostgreSQL database                                     |

Two nginx layers:
- **Host nginx** (`deploy/host-nginx.conf`): terminates SSL (Let's Encrypt), proxies to Docker nginx on port 8080.
- **Docker nginx** (`deploy/nginx/nginx.conf`): in-network reverse proxy routing requests between frontend and backend containers.

## Server Prerequisites

| Component | Version | Install |
|---|---|---|
| Ubuntu | 22.04 LTS | — |
| Docker | 24.x+ | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | v2.x+ | included with Docker |
| Nginx | latest | `sudo apt install -y nginx` |
| Certbot | latest | `sudo apt install -y certbot python3-certbot-nginx` |
| Git | latest | `sudo apt install -y git` |

## First-Time Deployment

Run on the server as a non-root user with sudo privileges.

### Step 1: Clone the repository

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone <YOUR_REPO_URL> unowire
cd unowire
```

### Step 2: Configure environment

Copy the template and fill in real production values:

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Required values:

| Variable | Description |
|---|---|
| `DB_PASSWORD` | Strong password for PostgreSQL `unowire` user |
| `JWT_SECRET` | Random string ≥ 32 chars for JWT signing |
| `ADMIN_EMAIL` | Initial admin account email |
| `ADMIN_PASSWORD` | Strong password for initial admin account |
| `DEBUG` | Keep `false` in production |

### Step 3: Verify frontend env

`frontend/.env.production` is committed with public values:

```
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
NODE_ENV=production
```

Update `NEXT_PUBLIC_SITE_URL` if deploying to a different domain.

### Step 4: Build and start services

```bash
docker compose -f docker-compose.yml --env-file .env.docker up -d --build
```

Verify all containers are healthy:

```bash
docker compose -f docker-compose.yml ps
# All services should show status "healthy"
```

Smoke test:

```bash
curl http://127.0.0.1:8080/
# Should return HTML with <title>Unowire</title>
curl http://127.0.0.1:8080/api/health
# Should return {"status":"ok"} or similar
```

### Step 5: Run database migrations

```bash
docker compose -f docker-compose.yml exec -T backend alembic upgrade head
docker compose -f docker-compose.yml exec -T backend python -m scripts.seed
```

### Step 6: Configure host Nginx

```bash
sudo cp /var/www/unowire/deploy/host-nginx.conf /etc/nginx/sites-available/unowire
sudo ln -sf /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

The host nginx config proxies all traffic to `127.0.0.1:8080` (the Docker nginx container's published port).

### Step 7: Configure DNS

At your domain registrar, create an A record:
- `www.unowire.com` → `<SERVER_IP>`
- `unowire.com` → `<SERVER_IP>` (apex, optional)

Wait for DNS propagation (check with `dig www.unowire.com`).

### Step 8: Provision SSL certificate

```bash
sudo certbot --nginx -d www.unowire.com -d unowire.com \
  --non-interactive --agree-tos --email <YOUR_EMAIL> --redirect
```

Certbot will automatically:
- Add `listen 443 ssl` + SSL certificate paths to the server block
- Create a port-80 server block redirecting HTTP → HTTPS
- Set up auto-renewal via systemd timer (`certbot.timer`)

Verify HTTPS: `curl -I https://www.unowire.com/` should return `HTTP/2 200`.

## Subsequent Deploys

From your local machine, push to master, then on the server:

```bash
cd /var/www/unowire
./deploy/deploy.sh master
```

The script does:
1. `git pull` latest code from specified branch
2. `docker compose build` rebuild images
3. Start `db` and `backend`, wait for healthcheck
4. Run `alembic upgrade head` + `python -m scripts.seed`
5. `docker compose up -d --remove-orphans` graceful restart of all services

## Rollback

If a deploy breaks the site:

```bash
cd /var/www/unowire
git log --oneline -10           # find the last good commit
git checkout <GOOD_COMMIT_HASH>
docker compose -f docker-compose.yml --env-file .env.docker up -d --build
docker compose -f docker-compose.yml exec -T backend alembic upgrade head
```

## Common Operations

| Action | Command |
|---|---|
| View container status | `docker compose -f docker-compose.yml ps` |
| View logs (all services) | `docker compose -f docker-compose.yml logs --tail=50` |
| View logs (single service) | `docker compose -f docker-compose.yml logs -f backend` |
| Restart a service | `docker compose -f docker-compose.yml restart backend` |
| Rebuild and restart | `docker compose -f docker-compose.yml up -d --build backend` |
| Enter backend shell | `docker compose -f docker-compose.yml exec backend bash` |
| Enter db shell | `docker compose -f docker-compose.yml exec db psql -U unowire` |
| Restart host Nginx | `sudo systemctl restart nginx` |
| Test host Nginx config | `sudo nginx -t` |
| Renew SSL manually | `sudo certbot renew --dry-run` |
| Check SSL expiry | `echo \| openssl s_client -connect www.unowire.com:443 2>/dev/null \| openssl x509 -noout -dates` |

## Troubleshooting

### Site returns 502 Bad Gateway

Docker nginx or upstream service is down. Check:

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=50 nginx frontend backend
```

Common causes:
- Frontend or backend container unhealthy → check logs, rebuild if needed
- Port 8080 already in use → `sudo lsof -i :8080`
- Backend migration pending → run `alembic upgrade head`

### Container fails to start

```bash
docker compose -f docker-compose.yml logs <service-name>
```

Common causes:
- `.env.docker` missing or has invalid values
- Port conflict (3000/8000/5432/8080 already in use on host)
- Insufficient disk space for PostgreSQL data volume

### Database connection refused

```bash
docker compose -f docker-compose.yml ps db
docker compose -f docker-compose.yml logs db
docker compose -f docker-compose.yml exec backend python -c "import asyncio; from app.core.config import settings; from sqlalchemy.ext.asyncio import create_async_engine; asyncio.run(create_async_engine(settings.DATABASE_URL).connect())"
```

### Certbot fails to verify domain

DNS not propagated or port 80 blocked. Check:

```bash
dig www.unowire.com
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### Reset database (⚠️ destructive)

Only for fresh reinstalls — destroys all data:

```bash
docker compose -f docker-compose.yml down -v
docker compose -f docker-compose.yml --env-file .env.docker up -d --build
docker compose -f docker-compose.yml exec -T backend alembic upgrade head
docker compose -f docker-compose.yml exec -T backend python -m scripts.seed
```

## File Inventory

| File | Purpose |
|---|---|
| `docker-compose.yml` | Production service orchestration (nginx + frontend + backend + db) |
| `docker-compose.dev.yml` | Development override (hot reload, exposed ports) |
| `.env.docker.example` | Template for production environment variables (commit-safe) |
| `.env.docker` | Actual production env vars (gitignored, server-only) |
| `frontend/.env.production` | Frontend public env vars (NEXT_PUBLIC_SITE_URL etc.) |
| `frontend/Dockerfile` | Frontend multi-stage build (standalone output) |
| `backend/Dockerfile` | Backend multi-stage build (gunicorn + uvicorn workers) |
| `deploy/nginx/Dockerfile` | Docker nginx image (wraps nginx:alpine) |
| `deploy/nginx/nginx.conf` | Container nginx config — routes `/api/` → backend, `/` → frontend |
| `deploy/host-nginx.conf` | Host nginx config — SSL termination + proxy to Docker (8080) |
| `deploy/deploy.sh` | One-command deploy script |
| `deploy/README.md` | This document |
