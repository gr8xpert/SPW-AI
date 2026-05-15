#!/bin/bash
# Phase 2+3: make services self-healing.
#   - Install pm2 systemd unit (auto-resurrect on reboot)
#   - Install watchdog cron (recover from PM2 daemon death)
#   - Tune ecosystem.config.js (min_uptime, max_restarts, exp_backoff)
#
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/harden-services.sh
# Run as root.

SPW_USER="spw-ai.com_owyn3ig1vb"
SPW_HOME="/var/www/vhosts/spw-ai.com"
PROJECT_DIR="$SPW_HOME/httpdocs/spw"
NODE_BIN="$SPW_HOME/.nvm/versions/node/v20.20.2/bin"
WATCHDOG_LOG="$SPW_HOME/logs/watchdog.log"
ALERT_EMAIL="webmaster@realtysoft.eu"
OUT="$SPW_HOME/httpdocs/harden-services-output.txt"

asuser() {
  sudo -u "$SPW_USER" -H bash -lc "export PATH=$NODE_BIN:\$PATH; cd $PROJECT_DIR; $*"
}

{
echo "=== Harden Services $(date) ==="

# ─── 1. Install pm2 systemd unit ──────────────────────────────
echo ""
echo "--- 1. Installing pm2 systemd unit for $SPW_USER ---"
# pm2 startup outputs a sudo command — capture and execute it
STARTUP_CMD=$(asuser "pm2 startup systemd -u $SPW_USER --hp $SPW_HOME" 2>&1 | grep -E "^sudo " | tail -1)
echo "startup install cmd: $STARTUP_CMD"
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" 2>&1
else
  # Already installed — just enable + start
  echo "(no install cmd emitted — assuming unit already exists)"
fi
sleep 1
systemctl enable "pm2-$SPW_USER" 2>&1
systemctl start "pm2-$SPW_USER" 2>&1
echo ""
echo "--- systemd unit status ---"
systemctl is-enabled "pm2-$SPW_USER" 2>&1
systemctl is-active "pm2-$SPW_USER" 2>&1

# Save current process list so resurrect has something to restore
echo ""
echo "--- pm2 save (snapshot current processes) ---"
asuser "pm2 save"

# ─── 2. Install watchdog cron ─────────────────────────────────
echo ""
echo "--- 2. Installing watchdog (every minute) ---"
mkdir -p "$SPW_HOME/logs"
chown "$SPW_USER:psacln" "$SPW_HOME/logs" 2>/dev/null

# Watchdog script
WATCHDOG_SH="$PROJECT_DIR/deploy/watchdog.sh"
cat > "$WATCHDOG_SH" << WATCHDOG_EOF
#!/bin/bash
# Cron watchdog — runs every minute. Recovers API/dashboard if down.
PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
LOG="$WATCHDOG_LOG"
STATE="$SPW_HOME/.watchdog-state"
ALERT="$ALERT_EMAIL"

# 3 consecutive failures before recovery (avoid flapping on brief blips)
FAILS=\$(cat "\$STATE" 2>/dev/null || echo 0)

API_OK=0
DASH_OK=0
curl -sf -m 5 http://127.0.0.1:3001/api/health >/dev/null 2>&1 && API_OK=1
curl -sf -m 5 -o /dev/null http://127.0.0.1:3000 2>&1 && DASH_OK=1

if [ "\$API_OK" -eq 1 ] && [ "\$DASH_OK" -eq 1 ]; then
  if [ "\$FAILS" -gt 0 ]; then
    echo "\$(date -Iseconds) RECOVERED api=ok dash=ok (was failing=\$FAILS)" >> "\$LOG"
  fi
  echo 0 > "\$STATE"
  exit 0
fi

FAILS=\$((FAILS + 1))
echo \$FAILS > "\$STATE"
echo "\$(date -Iseconds) DEGRADED api=\$API_OK dash=\$DASH_OK fails=\$FAILS" >> "\$LOG"

if [ "\$FAILS" -ge 3 ]; then
  echo "\$(date -Iseconds) RECOVERING — running pm2 resurrect" >> "\$LOG"
  sudo -u $SPW_USER -H bash -lc "export PATH=$NODE_BIN:\\\$PATH; cd $PROJECT_DIR; pm2 resurrect; pm2 status" >> "\$LOG" 2>&1

  # Email alert (only on first recovery to avoid spam)
  if [ "\$FAILS" -eq 3 ] && command -v mail >/dev/null 2>&1; then
    echo "SPW services were down — watchdog ran pm2 resurrect at \$(date)" | \
      mail -s "[SPW] Watchdog recovery triggered" "\$ALERT" 2>/dev/null
  fi
fi
WATCHDOG_EOF

chmod +x "$WATCHDOG_SH"
chown "$SPW_USER:psacln" "$WATCHDOG_SH" 2>/dev/null
echo "Watchdog script: $WATCHDOG_SH"
echo ""

# Install cron line if not present
CRON_LINE="* * * * * $WATCHDOG_SH"
if ! crontab -l 2>/dev/null | grep -F "$WATCHDOG_SH" >/dev/null; then
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Cron installed (root): $CRON_LINE"
else
  echo "Cron already installed"
fi
echo ""
echo "Current root crontab (filtered):"
crontab -l 2>/dev/null | grep -E "watchdog|pm2" | head -5

# ─── 3. Tune ecosystem.config.js ──────────────────────────────
echo ""
echo "--- 3. Patching ecosystem.config.js (idempotent) ---"
ECO="$PROJECT_DIR/ecosystem.config.js"
if [ -f "$ECO" ]; then
  cp "$ECO" "$ECO.bak.$(date +%s)"
  # Add min_uptime + max_restarts + exp_backoff_restart_delay if not present
  if ! grep -q "min_uptime" "$ECO"; then
    sudo -u "$SPW_USER" bash -c "cat > $ECO" << 'ECOEOF'
/**
 * PM2 Ecosystem Configuration
 * Smart Property Manager v2
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 */

module.exports = {
  apps: [
    {
      name: 'spm-api',
      script: './apps/api/dist/main.js',
      cwd: __dirname,
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // A process must stay up at least 30s to count as "stable".
      // Quick-crash loops trigger exponential backoff instead of hammering.
      min_uptime: '30s',
      max_restarts: 50,                 // generous — pair with exp_backoff so the daemon never gives up
      exp_backoff_restart_delay: 5000,  // 5s, 10s, 20s, ... up to 15min
      listen_timeout: 10000,
      kill_timeout: 30000,
      shutdown_with_message: true,
      wait_ready: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      merge_logs: true,
    },
    {
      name: 'spm-dashboard',
      script: 'npm',
      args: 'start',
      cwd: './apps/dashboard',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      min_uptime: '30s',
      max_restarts: 50,
      exp_backoff_restart_delay: 5000,
      listen_timeout: 10000,
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/dashboard-error.log',
      out_file: './logs/dashboard-out.log',
      log_file: './logs/dashboard-combined.log',
      time: true,
    },
  ],
};
ECOEOF
    echo "ecosystem.config.js patched (min_uptime, max_restarts, exp_backoff added)"
    echo "Reloading processes to apply new config..."
    asuser "pm2 reload ecosystem.config.js --env production --update-env"
    sleep 3
    asuser "pm2 save"
  else
    echo "ecosystem.config.js already has min_uptime — skipping patch"
  fi
else
  echo "WARN: $ECO not found"
fi

# ─── 4. Verify everything ─────────────────────────────────────
echo ""
echo "--- 4. VERIFY ---"
asuser "pm2 status"
echo ""
echo "Ports:"
ss -tlnp 2>&1 | grep -E ":(3000|3001)\b"
echo ""
echo "API health:"
curl -sS -i --max-time 5 http://localhost:3001/api/health 2>&1 | head -3
echo ""
echo "systemd unit:"
systemctl is-enabled "pm2-$SPW_USER"
systemctl is-active "pm2-$SPW_USER"
echo ""
echo "Run watchdog once to test:"
bash "$WATCHDOG_SH"
echo "Watchdog log:"
tail -3 "$WATCHDOG_LOG" 2>/dev/null || echo "(no log yet — fired on success)"

echo ""
echo "=== DONE $(date) ==="
} > "$OUT" 2>&1

echo "Output: $OUT"
echo "View: https://spw-ai.com/harden-services-output.txt"
