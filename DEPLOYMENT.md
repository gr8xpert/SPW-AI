# SPW v2 - Deployment Guide

---

## Current Production Environment (spw-ai.com)

| Component | URL | Server Path |
|-----------|-----|-------------|
| API | https://api.spw-ai.com | `/var/www/vhosts/spw-ai.com/spw/apps/api` |
| Dashboard | https://dashboard.spw-ai.com | `/var/www/vhosts/spw-ai.com/spw/apps/dashboard` |
| Widget CDN | https://cdn.spw-ai.com | `/var/www/vhosts/spw-ai.com/spw/apps/widget` |

### Credentials

Credentials are never stored in this repo. Obtain them from the team password manager:

- Dashboard admin login
- Database user password
- JWT secret
- Encryption key

If you are bootstrapping a new environment, generate fresh values (see `apps/api/.env.example`) and store them in the password manager.

### Quick Commands (Current Server)

```bash
# PM2 - Process Management
pm2 list                    # Check status
pm2 logs dashboard          # View dashboard logs
pm2 restart dashboard       # Restart dashboard
pm2 stop dashboard          # Stop
pm2 save                    # Save for auto-restart

# Nginx
sudo nginx -t               # Test config
sudo systemctl reload nginx # Apply changes

# Database Backup (one-off)
mysqldump -u spw_user -p spw_v2 > backup_$(date +%Y%m%d).sql
```

> For the full nightly backup + disaster-recovery runbook (S3 offload,
> retention, quarterly restore dry-run, step-by-step recovery), see
> [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md).

---

## Server Requirements

- **Node.js**: 20.x LTS
- **MySQL**: 8.0+
- **Redis**: 7.x
- **NGINX**: (reverse proxy)
- **PM2**: Process manager

## Quick Deployment Steps

### 1. Install Dependencies on Server

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2
```

### 2. Clone and Setup Project

```bash
cd /var/www
git clone <your-repo-url> spw
cd spw

# Install dependencies
pnpm install
```

### 3. Configure Environment

```bash
# API Environment
cp apps/api/.env.example apps/api/.env
nano apps/api/.env  # Edit with production values

# Dashboard Environment
cp apps/dashboard/.env.example apps/dashboard/.env.local
nano apps/dashboard/.env.local  # Edit with production values
```

### 4. Build All Applications

```bash
# Build everything
pnpm deploy:build

# Or individually:
pnpm build:api
pnpm build:dashboard
pnpm build:widget
```

### 5. Setup Database

```bash
# Create database (MySQL)
mysql -u root -p
CREATE DATABASE spw_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spw_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON spw_v2.* TO 'spw_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# Run migrations
pnpm db:migrate
```

### 6. Start with PM2

```bash
# Create logs directory
mkdir -p logs

# Start all services
pnpm pm2:start

# Save PM2 process list
pm2 save

# Setup startup script
pm2 startup
```

### 7. Configure NGINX

Create `/etc/nginx/sites-available/spw-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
```

Create `/etc/nginx/sites-available/spw-dashboard`:

```nginx
server {
    listen 80;
    server_name dashboard.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable sites:

```bash
sudo ln -s /etc/nginx/sites-available/spw-api /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/spw-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Setup SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com -d dashboard.yourdomain.com
```

## Widget Deployment

After building, the widget files are in `apps/widget/dist/`:

- `spw-widget.iife.js` - For `<script>` tag inclusion
- `spw-widget.es.js` - For ES module imports
- `spw-widget.umd.js` - Universal module

### CDN Deployment

Upload the dist folder to your CDN or serve from your API:

```bash
# Example: Copy to API public folder
cp -r apps/widget/dist/* apps/api/public/widget/
```

### Widget Usage

```html
<!-- Include the widget script -->
<script src="https://api.yourdomain.com/widget/spw-widget.iife.js"></script>

<!-- Or use auto-initialization with data attributes -->
<div
  data-spw-widget
  data-spw-api-url="https://api.yourdomain.com"
  data-spw-api-key="your-api-key">
</div>
```

## WordPress Plugin Installation

1. Copy `packages/wp-plugin` folder to your WordPress site's `/wp-content/plugins/spw-sync/`
2. Activate the plugin in WordPress admin
3. Go to Settings → SPW Sync
4. Enter your API URL and API Key
5. Copy the webhook URL and add it to your SPW Dashboard settings
6. Click "Sync Now" to perform initial sync

## Monitoring

```bash
# View PM2 status
pm2 status

# View logs
pm2 logs

# Monitor resources
pm2 monit
```

## Updating

```bash
cd /var/www/spw
git pull
pnpm install
pnpm deploy:build
pm2 restart all
```

## Environment Variables Reference

### API (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| NODE_ENV | Environment (production/development) | Yes |
| PORT | API port (default: 3001) | Yes |
| DATABASE_HOST | MySQL host | Yes |
| DATABASE_NAME | Database name | Yes |
| DATABASE_USER | Database user | Yes |
| DATABASE_PASSWORD | Database password | Yes |
| REDIS_HOST | Redis host | Yes |
| JWT_SECRET | JWT signing secret (min 32 chars) | Yes |
| ENCRYPTION_KEY | Data encryption key (32 chars) | Yes |

### Dashboard (.env.local)

| Variable | Description | Required |
|----------|-------------|----------|
| NEXT_PUBLIC_API_URL | API URL | Yes |
| NEXTAUTH_URL | Dashboard URL | Yes |
| NEXTAUTH_SECRET | NextAuth secret | Yes |

## Troubleshooting

### API not starting
- Check logs: `pm2 logs spw-api`
- Verify environment variables
- Check MySQL connection

### Dashboard 500 errors
- Check logs: `pm2 logs spw-dashboard`
- Verify NEXTAUTH_URL matches actual URL

### Widget not loading data
- Check API key is valid
- Verify CORS settings in API .env
- Check browser console for errors

---

## Migration to New Server

### Pre-Migration Checklist

- [ ] New server has Node.js 20+ installed
- [ ] New server has MySQL 8+ installed
- [ ] New server has Nginx installed
- [ ] New server has Redis installed (if using queues)
- [ ] DNS access available for domain changes
- [ ] SSL certificates plan (Let's Encrypt)

### Step 1: Backup Current Server

```bash
# 1. Backup database
mysqldump -u spw_user -p spw_v2 > spw_v2_backup_$(date +%Y%m%d).sql

# 2. Backup application files
cd /var/www/vhosts/spw-ai.com
tar -czvf spw-backup.tar.gz spw/

# 3. Export PM2 process list
pm2 save
cp ~/.pm2/dump.pm2 ./pm2-backup.pm2

# 4. Backup nginx configs
mkdir nginx-backup
cp /etc/nginx/sites-available/spw-* ./nginx-backup/
```

### Step 2: Setup New Server

```bash
# 1. Install Node.js 20 (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# 2. Install global packages
npm install -g pnpm pm2

# 3. Install MySQL
sudo apt install mysql-server
sudo mysql_secure_installation

# 4. Install Nginx
sudo apt install nginx

# 5. Install Redis (if needed)
sudo apt install redis-server
```

### Step 3: Transfer Data

```bash
# On new server - create directories
sudo mkdir -p /var/www/spw-ai.com
sudo chown $USER:$USER /var/www/spw-ai.com

# Transfer files (from old server)
scp user@oldserver:/path/spw-backup.tar.gz /var/www/spw-ai.com/
scp user@oldserver:/path/spw_v2_backup.sql /tmp/

# Extract files
cd /var/www/spw-ai.com
tar -xzvf spw-backup.tar.gz
```

### Step 4: Setup Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE spw_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'spw_user'@'localhost' IDENTIFIED BY '<REPLACE_WITH_SECURE_PASSWORD>';
GRANT ALL PRIVILEGES ON spw_v2.* TO 'spw_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

```bash
# Import database
mysql -u spw_user -p spw_v2 < /tmp/spw_v2_backup.sql
```

### Step 5: Configure Environment Files

**API (.env):**
```bash
cd /var/www/spw-ai.com/spw/apps/api
cp .env.example .env
# Edit with production values
```

**Dashboard (.env):**
```bash
cd /var/www/spw-ai.com/spw/apps/dashboard
# Create/edit .env with:
NEXT_PUBLIC_API_URL=https://api.spw-ai.com
NEXTAUTH_URL=https://dashboard.spw-ai.com
NEXTAUTH_SECRET=<generate-secure-secret>
```

### Step 6: Configure Nginx

**API (api.spw-ai.com):**
```nginx
server {
    listen 80;
    server_name api.spw-ai.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Dashboard (dashboard.spw-ai.com):**
```nginx
server {
    listen 80;
    server_name dashboard.spw-ai.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Widget CDN (cdn.spw-ai.com):**
```nginx
server {
    listen 80;
    server_name cdn.spw-ai.com;
    root /var/www/spw-ai.com/spw/apps/widget;

    # CORS headers for widget embedding
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;

    location ~* \.(js|map)$ {
        expires 1d;
        add_header Cache-Control "public, immutable";
        add_header 'Access-Control-Allow-Origin' '*';
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/spw-* /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: Setup SSL

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.spw-ai.com
sudo certbot --nginx -d dashboard.spw-ai.com
sudo certbot --nginx -d cdn.spw-ai.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

### Step 8: Start Applications

```bash
# Start API (if not using pm2 ecosystem file)
cd /var/www/spw-ai.com/spw/apps/api
pm2 start dist/main.js --name "api"

# Start Dashboard
cd /var/www/spw-ai.com/spw/apps/dashboard
pm2 start app.js --name "dashboard"

# Save and setup auto-start
pm2 save
pm2 startup
# Run the command it outputs with sudo
```

### Step 9: Update DNS

Update DNS A records to point to new server IP:
- `api.spw-ai.com` → New Server IP
- `dashboard.spw-ai.com` → New Server IP
- `cdn.spw-ai.com` → New Server IP

**Note:** DNS propagation takes 24-48 hours.

### Step 10: Post-Migration Verification

- [ ] API responds: `curl https://api.spw-ai.com/health`
- [ ] Dashboard login works: https://dashboard.spw-ai.com/login
- [ ] Widget loads: https://cdn.spw-ai.com/spw-widget.iife.js
- [ ] Database queries work (check dashboard data)
- [ ] SSL certificates valid (check browser)
- [ ] PM2 processes stable: `pm2 list`

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Dashboard     │     │      API        │     │   Widget CDN    │
│   (Next.js)     │────▶│   (NestJS)      │◀────│  (Static JS)    │
│   Port 3000     │     │   Port 3001     │     │                 │
└────────┬────────┘     └────────┬────────┘     └─────────────────┘
         │                       │
         │              ┌────────▼────────┐
         │              │     MySQL       │
         └─────────────▶│    Database     │
                        │     spw_v2      │
                        └─────────────────┘
```

---

*Last updated: April 6, 2026*
