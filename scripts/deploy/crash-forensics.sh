#!/bin/bash
# Forensic dump: why does spm-api keep crashing?
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/crash-forensics.sh

SPW_USER="spw-ai.com_owyn3ig1vb"
SPW_HOME="/var/www/vhosts/spw-ai.com"
PROJECT_DIR="$SPW_HOME/httpdocs/spw"
NODE_BIN="$SPW_HOME/.nvm/versions/node/v20.20.2/bin"
OUT="$SPW_HOME/httpdocs/crash-forensics-output.txt"

asuser() {
  sudo -u "$SPW_USER" -H bash -lc "export PATH=$NODE_BIN:\$PATH; cd $PROJECT_DIR; $*"
}

{
echo "=== Crash Forensics $(date) ==="

# 1. Restart history per process
echo ""
echo "--- 1. RESTART STATS (restart count, unstable count, last exit code) ---"
asuser "pm2 jlist 2>/dev/null" | python3 -c "
import json, sys, time
arr = json.load(sys.stdin)
for p in arr:
    e = p.get('pm2_env', {})
    print(f\"name={p['name']:<18} status={e.get('status'):<10} restarts={e.get('restart_time')} unstable={e.get('unstable_restarts')} exit_code={e.get('exit_code')} pm_uptime={e.get('pm_uptime')} created_at={e.get('created_at')} prev_restart_delay={e.get('prev_restart_delay', 0)}ms\")
"

# 2. Latest error log (last 500 lines, filter Redis warning noise)
echo ""
echo "--- 2. spm-api ERROR LOG (last 500, Redis-warning noise stripped) ---"
ERR_LOG="$PROJECT_DIR/logs/api-error.log"
if [ -f "$ERR_LOG" ]; then
  tail -500 "$ERR_LOG" | grep -v "highly recommended to use a minimum Redis" | grep -v "Current: 6.0.16" | tail -200
else
  echo "Log file not found: $ERR_LOG"
fi

# 3. Last 5 unique crash stack traces (Error/Exception lines + 8 lines after)
echo ""
echo "--- 3. LAST CRASH STACK TRACES (Error|Exception|UnhandledRejection patterns) ---"
if [ -f "$ERR_LOG" ]; then
  grep -nE "(Error|Exception|UnhandledPromiseRejection|FATAL|ECONNREFUSED|EADDRINUSE|out of memory|Killed|SIGSEGV|SIGTERM|SIGKILL|panic)" "$ERR_LOG" \
    | tail -30
  echo ""
  echo "--- Context around last error (20 lines) ---"
  LAST_ERR_LINE=$(grep -nE "(Error|Exception|UnhandledPromiseRejection|FATAL)" "$ERR_LOG" | tail -1 | cut -d: -f1)
  if [ -n "$LAST_ERR_LINE" ]; then
    START=$((LAST_ERR_LINE - 10))
    [ $START -lt 1 ] && START=1
    sed -n "${START},$((LAST_ERR_LINE + 20))p" "$ERR_LOG"
  fi
fi

# 4. Out-of-memory check (PM2 max_memory_restart = 1G)
echo ""
echo "--- 4. MEMORY RESTART HITS (PM2 killing for >1G usage) ---"
grep -E "exceeded memory limit|max_memory_restart" "$PROJECT_DIR/logs/"*.log 2>/dev/null | tail -10
echo "(empty = no memory-triggered kills)"

# 5. Combined log boot pattern — how long does it stay up?
echo ""
echo "--- 5. BOOT MARKERS (each line = an API start) ---"
grep "API listening" "$PROJECT_DIR/logs/"*.log 2>/dev/null | tail -20

# 6. systemd / kernel kills (OOM killer)
echo ""
echo "--- 6. KERNEL OOM / killed-process events for node ---"
( dmesg 2>/dev/null || journalctl -k --since "7 days ago" 2>/dev/null ) | grep -iE "killed process.*node|oom-kill" | tail -10

# 7. Disk space on log + db partitions
echo ""
echo "--- 7. DISK SPACE ---"
df -h "$PROJECT_DIR" /var /tmp 2>/dev/null

# 8. Current open file descriptors for any node process (leak indicator)
echo ""
echo "--- 8. NODE PROCESSES + FD COUNT ---"
for pid in $(pgrep -u "$SPW_USER" node); do
  fds=$(ls /proc/$pid/fd 2>/dev/null | wc -l)
  cmd=$(tr '\0' ' ' </proc/$pid/cmdline 2>/dev/null | cut -c1-120)
  echo "pid=$pid fds=$fds  cmd=$cmd"
done

# 9. ecosystem.config.js current settings
echo ""
echo "--- 9. ECOSYSTEM CONFIG (for tuning context) ---"
cat "$PROJECT_DIR/ecosystem.config.js" 2>/dev/null

# 10. pm2 startup status
echo ""
echo "--- 10. PM2 STARTUP / SYSTEMD ---"
systemctl status pm2-$SPW_USER 2>&1 | head -10
ls -la /etc/systemd/system/ 2>&1 | grep -i pm2

echo ""
echo "=== DONE $(date) ==="
} > "$OUT" 2>&1

echo "Output: $OUT"
echo "View: https://spw-ai.com/crash-forensics-output.txt"
