# Deploying the Deniz API

A step-by-step guide for an Ubuntu server (22.04 or newer): the API as a systemd service behind nginx with HTTPS,
PostgreSQL on the same machine, nightly backups. Every file this guide installs is in `deploy/`; all of them were
tested together (nginx in front of the production build, the deploy and backup scripts, a restore).

Throughout: the Linux user is **`arvin`** and the project folder **`/home/arvin/deniz-api`**. Set the API's domain
once, in the shell you run the commands in (every command below uses it):

```bash
DOMAIN=api.example.ir        # ← the real domain; its DNS A record must point to this server
```

| File | What it is |
| --- | --- |
| `deploy/nginx/deniz-api.conf` | nginx site: proxies `/api` and `/health`, serves `/uploads` from disk, 404 for everything else |
| `deploy/systemd/deniz-api.service` | systemd service: runs `dist/server.js`, restarts on failure, hardened |
| `deploy/scripts/deploy.sh` | One command per update: backup → code → `npm ci` → build → migrations → switch → restart → health check, and back to the previous build if the new one does not start |
| `deploy/scripts/backup.sh` | Database (`pg_dump`) + images, keeps 14 days |

---

## 1. First-time setup

### 1.1 Packages

```bash
sudo apt update
sudo apt install -y postgresql nginx certbot python3-certbot-nginx curl git
# Node.js 22 LTS (20.19+ works; 24 too)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && which node        # the systemd file expects /usr/bin/node
```

### 1.2 Database

```bash
DB_PASSWORD="$(openssl rand -hex 16)"; echo "$DB_PASSWORD"     # keep it for .env
sudo -u postgres psql -c "CREATE USER deniz WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE deniz OWNER deniz;"
```

### 1.3 The code

```bash
cd ~
git clone <repo-url> deniz-api        # or: unzip deniz-api.zip
cd deniz-api
```

### 1.4 `.env`

```bash
cp .env.example .env
chmod 600 .env                         # only arvin may read it (nginx is in arvin's group, see 1.7)
openssl rand -hex 32                   # → ADMIN_JWT_SECRET
nano .env
```

Production values:

```dotenv
DATABASE_URL="postgresql://deniz:DB_PASSWORD@localhost:5432/deniz?schema=public&connection_limit=10"
PORT=3000
APP_URL="https://api.example.ir"      # your $DOMAIN
ADMIN_JWT_SECRET="<the openssl output>"
CORS_ORIGINS="https://deniz.ir"       # the frontend's address; empty if it is served from this same domain
SEED_ADMIN_USERNAME="developer"
SEED_ADMIN_PASSWORD="<a strong password, 8+ characters>"
SEED_ADMIN_NAME="Arvin"
```

`NODE_ENV=production` is set by the systemd service, not in `.env`. In production the server refuses to start with a
missing or short `ADMIN_JWT_SECRET`, or with the example value from `.env.example`.

### 1.5 Install, create the tables, first admin, build

```bash
npm ci
npx prisma migrate deploy
npm run db:seed          # settings, the developer account, the starter survey
npm run build
```

Then **remove `SEED_ADMIN_PASSWORD` from `.env`**; it is not needed any more (the seed never changes an existing
account).

### 1.6 The service

```bash
sed -e 's#/home/arvin/deniz-api#'"$PWD"'#g' -e "s#^User=arvin#User=$USER#" -e "s#^Group=arvin#Group=$USER#" \
	deploy/systemd/deniz-api.service | sudo tee /etc/systemd/system/deniz-api.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now deniz-api
curl -s http://127.0.0.1:3000/health        # {"ok":true,"service":"deniz","db":true}
```

The API listens on `127.0.0.1` only: it cannot be reached from outside except through nginx.

### 1.7 nginx and HTTPS

```bash
sed -e 's#/home/arvin/deniz-api#'"$PWD"'#g' -e "s#api\.example\.ir#$DOMAIN#g" \
	deploy/nginx/deniz-api.conf | sudo tee /etc/nginx/sites-available/deniz-api >/dev/null
sudo ln -sf /etc/nginx/sites-available/deniz-api /etc/nginx/sites-enabled/deniz-api
# nginx (user www-data) serves the images straight from the project folder; the service writes them readable for
# its own group only, so www-data joins that group. .env (600) and backups/ (700) stay private.
sudo usermod -aG "$USER" www-data
sudo nginx -t && sudo systemctl restart nginx
sudo certbot --nginx -d "$DOMAIN"        # HTTPS + automatic renewal
```

The DNS A record of the domain must already point to the server. If the server has IPv6, uncomment
`listen [::]:80;` in the nginx file.

Check: `curl -s "https://$DOMAIN/health"` and open `https://<your domain>/api/survey` in a browser.

### 1.8 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Port 3000 stays closed (and the API only listens on 127.0.0.1 anyway).

### 1.9 Nightly backups

```bash
bash deploy/scripts/backup.sh          # once by hand, to see it work
crontab -e
# add:
30 3 * * * cd /home/arvin/deniz-api && mkdir -p backups && bash deploy/scripts/backup.sh >> backups/backup.log 2>&1
```

Backups land in `backups/` (database dump + the images), 14 days are kept (`KEEP_DAYS=30 bash …` for more). They are on
the same disk as the server: copy them elsewhere from time to time (e.g. `scp` to your computer).

---

## 2. Updating

```bash
cd /home/arvin/deniz-api
# git clone: the script pulls by itself. A zip: unzip the new version over the folder first (keep .env and uploads/).
bash deploy/scripts/deploy.sh
```

What the script guarantees:

- It backs up first and stops at the first error.
- The new build goes to `dist.new`. A build with errors changes nothing: not the database, not what the service runs.
- Database migrations run only after the build succeeded.
- The service is switched to the new build and restarted only at the very end; until then the old version serves.
- It waits for `/health`. If the new version does not start, it prints the last log lines, **puts the previous build
  back and restarts it**, and exits with an error. The failed build stays in `dist.failed`, the previous one of a
  successful deploy in `dist.old`.

## 3. When something goes wrong

| Situation | What to do |
| --- | --- |
| See the logs | `journalctl -u deniz-api -n 100 --no-pager` (live: `-f`) |
| Is it running? | `systemctl status deniz-api` and `curl -s http://127.0.0.1:3000/health` (`db:false` = the database is down) |
| New version does not start | Read the log: the server says exactly which `.env` value is wrong. Fix it, `sudo systemctl restart deniz-api` |
| Go back to the previous build (after a deploy that started fine) | `rm -rf dist && mv dist.old dist && sudo systemctl restart deniz-api` |
| Go back to older code | git: `git checkout <previous commit>`; zip: unzip the previous version. Then `bash deploy/scripts/deploy.sh` |
| Restore the database | `sudo systemctl stop deniz-api`, then `pg_restore --clean --if-exists --no-owner -d "postgresql://deniz:DB_PASSWORD@localhost:5432/deniz" backups/db-….dump`, then start it again |
| Restore the images | `tar -xzf backups/uploads-….tar.gz` in the project folder |
| Lost the admin password | Another manager or developer sets a new one in the panel. The last developer: `sudo -u postgres psql deniz`, delete the row in `"AdminUser"`, put `SEED_ADMIN_PASSWORD` back in `.env`, run `npm run db:seed`, remove it again |

## 4. Variations

**Frontend on the same domain** (`deniz.ir` serves the site, `deniz.ir/api` the API): use one nginx `server` for
`deniz.ir`, keep the `/api/`, `/health` and `/uploads/` blocks of `deniz-api.conf`, and replace `location / { return
404; }` with the frontend (e.g. `root /var/www/deniz; try_files $uri /index.html;`). Leave `CORS_ORIGINS` empty.

**Frontend on another domain** (`deniz.ir` + `api.deniz.ir`): `CORS_ORIGINS="https://deniz.ir"`. The frontend calls
the API with `fetch(url, { credentials: 'include' })`.

**Admin panel on a different site** (e.g. a `vercel.app` address): also `ADMIN_COOKIE_CROSS_SITE=true` (HTTPS only).

**A CDN in front of nginx** (e.g. ArvanCloud): set `TRUST_PROXY=2` and make nginx pass the client's IP from the CDN's
header (`set_real_ip_from <CDN ranges>; real_ip_header X-Forwarded-For;`), otherwise every customer looks like the
CDN to the rate limits.

## 5. Production checklist

- [ ] `.env` is `600`, has a random `ADMIN_JWT_SECRET`, no `SEED_ADMIN_PASSWORD`
- [ ] `systemctl is-enabled deniz-api` → enabled (starts after a reboot)
- [ ] `https://…/health` answers `{"ok":true,…,"db":true}`; `http://` redirects to `https://`
- [ ] An image URL (`/uploads/products/…`) loads in the browser (if 403: step 1.7, the `usermod` line)
- [ ] `ufw status`: only SSH, 80, 443
- [ ] `crontab -l` shows the backup line; `backups/` has a fresh dump the next morning
- [ ] SSH: key login only (`PasswordAuthentication no`, `PermitRootLogin no` in `/etc/ssh/sshd_config`)
- [ ] The developer account's password is strong; staff got their own accounts with the right roles
