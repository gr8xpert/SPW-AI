#!/bin/bash
# Find pm2 binary by inspecting the running dashboard (next-server) process.
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/find-pm2.sh

OUT="/var/www/vhosts/spw-ai.com/httpdocs/find-pm2-output.txt"

{
echo "=== Find PM2 $(date) ==="

# 1. Who runs the dashboard (port 3000)?
echo ""
echo "--- Process on port 3000 ---"
ss -tlnp 2>&1 | grep ':3000\b'
DASH_PID=$(ss -tlnp 2>&1 | grep ':3000\b' | grep -oP 'pid=\K[0-9]+' | head -1)
echo "DASH_PID=$DASH_PID"
if [ -n "$DASH_PID" ]; then
  echo ""
  echo "--- ps for that pid ---"
  ps -o pid,user,cmd -p "$DASH_PID" 2>&1
  DASH_USER=$(ps -o user= -p "$DASH_PID" 2>&1 | tr -d ' ')
  echo "DASH_USER=$DASH_USER"
  echo ""
  echo "--- exe + cwd ---"
  ls -la /proc/$DASH_PID/exe 2>&1
  ls -la /proc/$DASH_PID/cwd 2>&1
  echo ""
  echo "--- env (PATH + NVM) ---"
  tr '\0' '\n' < /proc/$DASH_PID/environ 2>/dev/null | grep -E "^(PATH|NVM_DIR|NVM_BIN|HOME)=" | head -10
fi

# 2. Any pm2 daemon running?
echo ""
echo "--- pm2 daemons running ---"
ps -eo pid,user,cmd 2>&1 | grep -iE "pm2|god daemon" | grep -v grep

# 3. Search filesystem for pm2 binary
echo ""
echo "--- find / -name pm2 -type f (skip /proc /sys) ---"
find / -xdev -type f -name pm2 2>/dev/null | head -20
echo ""
echo "--- find pm2 symlinks ---"
find / -xdev -type l -name pm2 2>/dev/null | head -20

# 4. Search for nvm.sh
echo ""
echo "--- nvm.sh locations ---"
find / -xdev -type f -name nvm.sh 2>/dev/null | head -10

echo ""
echo "=== DONE $(date) ==="
} > "$OUT" 2>&1

echo "Output: $OUT"
cat "$OUT"
