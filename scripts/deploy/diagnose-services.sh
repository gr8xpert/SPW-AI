#!/bin/bash
# Full stack health diagnostic — checks if every service is actually up.
# Catches the "not just login, the whole network was down" scenario.
#
# Usage:
#   1. FTP to:       /var/www/vhosts/spw-ai.com/httpdocs/deploy/diagnose-services.sh
#   2. SSH and run:  bash /var/www/vhosts/spw-ai.com/httpdocs/deploy/diagnose-services.sh
#   3. Output at:    /var/www/vhosts/spw-ai.com/httpdocs/diagnose-services-output.txt
#
# Optional: set these for a deeper check (login POST + user lookup).
# Leave blank to skip those sections.
TEST_EMAIL=""
TEST_PASS=""

OUT="/var/www/vhosts/spw-ai.com/httpdocs/diagnose-services-output.txt"
API_LOCAL="http://localhost:3001"
DASH_LOCAL="http://localhost:3000"

hr() { echo ""; echo "------------------------------------------------------------"; echo " $1"; echo "------------------------------------------------------------"; }

{
echo "============================================================"
echo " SPW Full-Stack Service Diagnostic"
echo " $(date)"
echo " host: $(hostname)  uptime: $(uptime -p 2>/dev/null || uptime)"
echo "============================================================"

# ─── 1. System resources (out-of-disk / OOM kills services silently) ──
hr "1. SYSTEM RESOURCES"
echo "--- Memory (free -h) ---"
free -h 2>&1 || echo "free not available"
echo ""
echo "--- Disk (df -h) ---"
df -h 2>&1 | grep -vE "tmpfs|udev"
echo ""
echo "--- Load avg ---"
cat /proc/loadavg 2>/dev/null || uptime
echo ""
echo "--- Recent OOM kills (last 24h) ---"
( dmesg 2>/dev/null | grep -i "killed process" | tail -10 ) || \
  ( journalctl -k --since "24 hours ago" 2>/dev/null | grep -i "killed process" | tail -10 ) || \
  echo "(no permission to read kernel log)"

# ─── 2. PM2 process state ────────────────────────────────────────────
hr "2. PM2 PROCESS STATE"
pm2 status 2>&1 || { echo "pm2 not in PATH — trying with sudo or absolute path"; which pm2; }
echo ""
echo "--- pm2 jlist (machine-readable: name, status, restarts, uptime, mem, cpu) ---"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, datetime
try:
    arr = json.load(sys.stdin)
    if not arr:
        print('(no pm2 processes)')
    for p in arr:
        ps = p.get('pm2_env', {})
        mon = p.get('monit', {})
        status = ps.get('status', '?')
        restarts = ps.get('restart_time', 0)
        unstable = ps.get('unstable_restarts', 0)
        uptime_ms = max(0, int(__import__('time').time()*1000) - int(ps.get('pm_uptime', 0)))
        uptime_s = uptime_ms // 1000
        mem_mb = round(mon.get('memory', 0) / 1024 / 1024, 1)
        cpu = mon.get('cpu', 0)
        port = ps.get('PORT', ps.get('env', {}).get('PORT', '?'))
        print(f\"  {p['name']:<20} status={status:<10} restarts={restarts:<4} unstable={unstable:<3} uptime={uptime_s}s mem={mem_mb}MB cpu={cpu}% port={port}\")
except Exception as e:
    print(f'(jlist parse failed: {e})')
" 2>&1

# ─── 3. Port bindings (the truth about what's listening) ─────────────
hr "3. PORTS LISTENING (truth check)"
echo "Expected: 3001 (API), 3000 (dashboard), 3306 (MySQL), 6379 (Redis), 80/443 (web)"
echo ""
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>&1 | grep -E ":(80|443|3000|3001|3306|6379)\b" || echo "(none of the expected ports are listening!)"
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>&1 | grep -E ":(80|443|3000|3001|3306|6379)\b" || echo "(none of the expected ports are listening!)"
else
  echo "(neither ss nor netstat available)"
fi

# ─── 4. Local HTTP health checks ─────────────────────────────────────
hr "4. LOCAL HEALTH PROBES"
echo "--- API: $API_LOCAL/api/health ---"
curl -sS -i --max-time 8 -o /tmp/_api_health.txt -w "HTTP %{http_code} | time_total=%{time_total}s | size=%{size_download}B\n" "$API_LOCAL/api/health" 2>&1
echo "Body (first 500 chars):"
head -c 500 /tmp/_api_health.txt 2>/dev/null
echo ""
echo ""
echo "--- API: $API_LOCAL/api (root, expect 404 or hello — proves Node up) ---"
curl -sS -i --max-time 5 -o /tmp/_api_root.txt -w "HTTP %{http_code}\n" "$API_LOCAL/api" 2>&1
head -c 300 /tmp/_api_root.txt
echo ""
echo ""
echo "--- Dashboard: $DASH_LOCAL ---"
curl -sS -i --max-time 8 -o /dev/null -w "HTTP %{http_code} | time_total=%{time_total}s\n" "$DASH_LOCAL" 2>&1

# ─── 5. Public-URL probes (DNS, certs, reverse proxy all in one) ─────
hr "5. PUBLIC URL PROBES"
PUBLIC_DASH=""
PUBLIC_API=""
for n in spm-dashboard spw-dashboard dashboard; do
  v=$(pm2 env "$n" 2>/dev/null | grep -E "^NEXT_PUBLIC_API_URL=" | head -1 | cut -d= -f2-)
  if [ -n "$v" ]; then PUBLIC_API="$v"; break; fi
done
for n in spm-dashboard spw-dashboard dashboard; do
  v=$(pm2 env "$n" 2>/dev/null | grep -E "^NEXTAUTH_URL=" | head -1 | cut -d= -f2-)
  if [ -n "$v" ]; then PUBLIC_DASH="$v"; break; fi
done
echo "Resolved from PM2 env: PUBLIC_API='$PUBLIC_API'  PUBLIC_DASH='$PUBLIC_DASH'"
echo ""
if [ -n "$PUBLIC_API" ]; then
  echo "--- $PUBLIC_API/api/health ---"
  curl -sS -i --max-time 10 -o /tmp/_pub_api.txt -w "HTTP %{http_code} | time_total=%{time_total}s\n" "$PUBLIC_API/api/health" 2>&1
  head -c 400 /tmp/_pub_api.txt
  echo ""
fi
if [ -n "$PUBLIC_DASH" ]; then
  echo ""
  echo "--- $PUBLIC_DASH (dashboard root) ---"
  curl -sS -i --max-time 10 -o /dev/null -w "HTTP %{http_code} | time_total=%{time_total}s\n" "$PUBLIC_DASH" 2>&1
fi

# ─── 6. Database connectivity ────────────────────────────────────────
hr "6. DATABASE"
API_NAME=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; arr=json.load(sys.stdin); n=[p['name'] for p in arr if 'api' in p['name'].lower()]; print(n[0] if n else '')" 2>/dev/null)
echo "API process name: '$API_NAME'"
if [ -n "$API_NAME" ]; then
  DB_HOST=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^(DB_HOST|DATABASE_HOST|MYSQL_HOST)=" | head -1 | cut -d= -f2-)
  DB_PORT=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^(DB_PORT|DATABASE_PORT|MYSQL_PORT)=" | head -1 | cut -d= -f2-)
  DB_USER=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^(DB_USERNAME|DATABASE_USERNAME|DB_USER|MYSQL_USER)=" | head -1 | cut -d= -f2-)
  DB_PASS=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^(DB_PASSWORD|DATABASE_PASSWORD|MYSQL_PASSWORD)=" | head -1 | cut -d= -f2-)
  DB_NAME=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^(DB_DATABASE|DATABASE_NAME|DB_NAME|MYSQL_DATABASE)=" | head -1 | cut -d= -f2-)
  echo "DB cfg: host=$DB_HOST port=${DB_PORT:-3306} user=$DB_USER db=$DB_NAME"
fi
echo ""
echo "--- TCP reach to MySQL ---"
if command -v nc >/dev/null 2>&1; then
  nc -zv -w 4 "${DB_HOST:-localhost}" "${DB_PORT:-3306}" 2>&1
else
  timeout 4 bash -c "</dev/tcp/${DB_HOST:-localhost}/${DB_PORT:-3306}" 2>&1 && echo "TCP OK" || echo "TCP FAILED"
fi
echo ""
if command -v mysql >/dev/null 2>&1 && [ -n "$DB_HOST" ] && [ -n "$DB_USER" ]; then
  echo "--- MySQL ping ---"
  mysql -h"$DB_HOST" -P"${DB_PORT:-3306}" -u"$DB_USER" -p"$DB_PASS" -e "SELECT VERSION() AS version, NOW() AS server_time, DATABASE() AS db;" "$DB_NAME" 2>&1 | head -8
  echo ""
  echo "--- users row count + last login ---"
  mysql -h"$DB_HOST" -P"${DB_PORT:-3306}" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e \
    "SELECT COUNT(*) AS total_users, SUM(role='super_admin') AS super_admins, SUM(isActive=1) AS active, SUM(emailVerifiedAt IS NOT NULL) AS verified FROM users\\G" 2>&1
else
  echo "(mysql client unavailable or DB env not detected)"
fi

# ─── 7. Redis (BullMQ queues, feed scheduler, etc.) ─────────────────
hr "7. REDIS"
REDIS_HOST=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^REDIS_HOST=" | head -1 | cut -d= -f2-)
REDIS_PORT=$(pm2 env "$API_NAME" 2>/dev/null | grep -E "^REDIS_PORT=" | head -1 | cut -d= -f2-)
echo "Redis cfg: host=${REDIS_HOST:-localhost} port=${REDIS_PORT:-6379}"
if command -v redis-cli >/dev/null 2>&1; then
  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" PING 2>&1
  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" INFO server 2>&1 | grep -E "^(redis_version|uptime_in_seconds|connected_clients|used_memory_human)" || true
else
  echo "redis-cli not installed — TCP check only:"
  timeout 4 bash -c "</dev/tcp/${REDIS_HOST:-localhost}/${REDIS_PORT:-6379}" 2>&1 && echo "TCP OK" || echo "TCP FAILED"
fi

# ─── 8. Nginx / reverse proxy ────────────────────────────────────────
hr "8. NGINX / WEB PROXY"
if command -v nginx >/dev/null 2>&1; then
  echo "--- nginx -t ---"
  nginx -t 2>&1 | head -5
  echo ""
fi
echo "--- nginx / Plesk web service ---"
systemctl is-active nginx 2>&1
systemctl is-active apache2 2>&1
systemctl is-active httpd 2>&1
systemctl is-active plesk-php* 2>&1 | head -3

# ─── 9. Live login POST (optional) ───────────────────────────────────
hr "9. LIVE LOGIN POST"
if [ -n "$TEST_EMAIL" ] && [ -n "$TEST_PASS" ]; then
  echo "POSTing $API_LOCAL/api/auth/login as $TEST_EMAIL"
  curl -sS -i --max-time 10 -X POST "$API_LOCAL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}" 2>&1 | head -40
else
  echo "(skipped — set TEST_EMAIL + TEST_PASS at top of script to enable)"
fi

# ─── 10. Recent logs from every PM2 process ──────────────────────────
hr "10. RECENT PM2 LOGS (last 60 lines per process)"
ALL_NAMES=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name']) for p in json.load(sys.stdin)]" 2>/dev/null)
for n in $ALL_NAMES; do
  echo ""
  echo "=== $n (out) ==="
  pm2 logs "$n" --lines 60 --nostream --out 2>&1 | tail -70
  echo ""
  echo "=== $n (err) ==="
  pm2 logs "$n" --lines 60 --nostream --err 2>&1 | tail -70
done

# ─── 11. Time / NTP (clock skew breaks JWT) ──────────────────────────
hr "11. CLOCK"
date
echo "UTC: $(date -u)"
timedatectl 2>&1 | head -6 || echo "(timedatectl unavailable)"

echo ""
echo "============================================================"
echo " END — $(date)"
echo "============================================================"
} > "$OUT" 2>&1

echo "Diagnostic written to: $OUT"
echo "View with: cat $OUT"
echo "Or download via FTP."
