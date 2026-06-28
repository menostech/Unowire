# Unowire Deployment Guide

Production deployment for the Unowire cable specs database at **www.unowire.com**.

## Architecture

```
Internet → Nginx (443/HTTPS) → Next.js (127.0.0.1:3000, PM2-managed)
```

- **Next.js 16** runs as a Node.js server (`next start`) managed by PM2.
- **Nginx** terminates SSL, serves as reverse proxy, caches static assets.
- **No Docker, no CI/CD** — manual deploys via `deploy/deploy.sh`.
- **No backend** — data is static JSON in `frontend/data/`.

## Server Prerequisites

| Component | Version | Install |
|---|---|---|
| Ubuntu | 22.04 LTS | — |
| Node.js | 20.x LTS | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| PM2 | latest | `sudo npm install -g pm2` |
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

The `frontend/.env.production` file is committed to the repo with public env vars. If you need to override values, edit it on the server:

```bash
nano frontend/.env.production
# Verify: NEXT_PUBLIC_SITE_URL=https://www.unowire.com
```

### Step 3: Install dependencies and build

```bash
cd frontend
npm ci
npm run build
```

The `prebuild` hook auto-validates all JSON data. Build fails fast on bad data.

### Step 4: Start with PM2

```bash
cd frontend
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Follow the printed instructions to make PM2 start on boot
```

Verify: `pm2 status` should show `unowire-frontend` as `online`.

```bash
curl http://127.0.0.1:3000/
# Should return HTML with <title>Unowire — Cable Specs Database</title>
```

### Step 5: Configure Nginx

```bash
sudo cp /var/www/unowire/deploy/nginx-unowire.conf /etc/nginx/sites-available/unowire
sudo ln -s /etc/nginx/sites-available/unowire /etc/nginx/sites-enabled/unowire
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Verify: `curl http://localhost/` should return the same HTML (via Nginx proxy).

```bash
curl http://localhost/
# Should return HTML with <title>Unowire — Cable Specs Database</title> (HTTP 200)
```

### Step 6: Configure DNS

At your domain registrar, create an A record:
- `www.unowire.com` → `<SERVER_IP>`
- `unowire.com` → `<SERVER_IP>` (optional, apex redirect)

Wait for DNS propagation (check with `dig www.unowire.com`).

### Step 7: Provision SSL certificate

```bash
sudo certbot --nginx -d www.unowire.com -d unowire.com \
  --non-interactive --agree-tos --email <YOUR_EMAIL> --redirect
```

Certbot will:
- Auto-edit `/etc/nginx/sites-enabled/unowire` to inject SSL cert paths
- Set up auto-renewal via systemd timer (`certbot.timer`)

Verify HTTPS: `curl -I https://www.unowire.com/` should return `HTTP/2 200`.

## Subsequent Deploys

From your local machine, push to master, then on the server:

```bash
cd /var/www/unowire
./deploy/deploy.sh master
```

The script does: `git pull` → `npm ci` → `npm run build` → `pm2 reload` → `nginx reload`.

`pm2 reload` triggers a graceful restart (in fork mode, this is equivalent to `restart` — brief downtime may occur). Acceptable for MVP.

## Rollback

If a deploy breaks the site:

```bash
cd /var/www/unowire
git log --oneline -10           # find the last good commit
git checkout <GOOD_COMMIT_HASH>
cd frontend
npm ci && npm run build
pm2 reload ecosystem.config.cjs --update-env
```

## Common Operations

| Action | Command |
|---|---|
| View PM2 status | `pm2 status` |
| View PM2 logs (live) | `pm2 logs unowire-frontend` |
| View last 100 log lines | `pm2 logs unowire-frontend --lines 100` |
| Restart PM2 (hard) | `pm2 restart unowire-frontend` |
| Reload PM2 (zero-downtime) | `pm2 reload unowire-frontend` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Reload Nginx | `sudo systemctl reload nginx` |
| Test Nginx config | `sudo nginx -t` |
| Renew SSL manually | `sudo certbot renew --dry-run` |
| Check SSL expiry | `echo \| openssl s_client -connect www.unowire.com:443 2>/dev/null \| openssl x509 -noout -dates` |

## Troubleshooting

### Site returns 502 Bad Gateway

PM2 process is down. Check:
```bash
pm2 status
pm2 logs unowire-frontend --lines 50 --err
```
Common cause: build artifact missing or port 3000 already in use. Fix and `pm2 reload`.

### Build fails on `prebuild` validation

JSON data integrity check failed. Inspect the validation output, fix the offending JSON file in `frontend/data/`, commit, push, redeploy.

### Certbot fails to verify domain

DNS not propagated or port 80 blocked. Check:
```bash
dig www.unowire.com
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### PM2 not auto-starting on reboot

Re-run `pm2 startup` and follow the printed `sudo env ...` command.

## File Inventory

| File | Purpose |
|---|---|
| `frontend/.env.production` | Production env vars (NEXT_PUBLIC_SITE_URL etc.) |
| `frontend/ecosystem.config.cjs` | PM2 process definition |
| `deploy/nginx-unowire.conf` | Nginx site config (HTTP redirect + HTTPS proxy) |
| `deploy/deploy.sh` | One-command deploy script |
| `deploy/README.md` | This document |
