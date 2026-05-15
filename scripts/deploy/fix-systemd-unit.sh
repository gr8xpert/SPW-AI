#!/bin/bash
# Convert pm2 systemd unit from Type=forking (PID-file based) to Type=oneshot.
# Reason: PM2 doesn't always rewrite pm2.pid on resurrect, causing systemd to fail
# with "Can't open PID file ... Operation not permitted" / Result: protocol.
#
# Usage: bash /var/www/vhosts/spw-ai.com/httpdocs/spw/deploy/fix-systemd-unit.sh

SPW_USER="spw-ai.com_owyn3ig1vb"
SPW_HOME="/var/www/vhosts/spw-ai.com"
NODE_BIN="$SPW_HOME/.nvm/versions/node/v20.20.2/bin"
PM2_BIN="$NODE_BIN/pm2"
UNIT="pm2-$SPW_USER"
UNIT_FILE="/etc/systemd/system/$UNIT.service"
OUT="$SPW_HOME/httpdocs/fix-systemd-output.txt"

asuser() {
  sudo -u "$SPW_USER" -H bash -lc "export PATH=$NODE_BIN:\$PATH; $*"
}

{
echo "=== Fix systemd unit (oneshot conversion) $(date) ==="

# 1. Save current process list (must happen BEFORE killing PM2)
echo ""
echo "--- 1. SAVE current pm2 list ---"
asuser "pm2 status"
asuser "pm2 save"

# 2. Rewrite unit as oneshot
echo ""
echo "--- 2. WRITE new unit file ---"
systemctl stop "$UNIT" 2>&1
systemctl reset-failed "$UNIT" 2>&1

cat > "$UNIT_FILE" << UNIT_EOF
[Unit]
Description=PM2 process manager
Documentation=https://pm2.keymetrics.io/
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$SPW_USER
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
Environment=PATH=$NODE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PM2_HOME=$SPW_HOME/.pm2

ExecStart=$PM2_BIN resurrect
ExecReload=$PM2_BIN reload all
ExecStop=$PM2_BIN kill

[Install]
WantedBy=multi-user.target
UNIT_EOF

echo "Wrote $UNIT_FILE:"
cat "$UNIT_FILE"

systemctl daemon-reload

# 3. Kill orphan PM2 daemon so systemd owns the new one cleanly
echo ""
echo "--- 3. KILL existing PM2 daemon (so systemd-owned resurrect takes over) ---"
asuser "pm2 kill"
sleep 2

# 4. Enable + start under systemd
echo ""
echo "--- 4. ENABLE + START via systemd ---"
systemctl enable "$UNIT" 2>&1
systemctl start "$UNIT" 2>&1
sleep 4
systemctl status "$UNIT" --no-pager 2>&1 | head -20
echo ""
echo "is-enabled: $(systemctl is-enabled $UNIT 2>&1)"
echo "is-active:  $(systemctl is-active $UNIT 2>&1)"

# 5. Verify processes back online
echo ""
echo "--- 5. PM2 STATUS after systemd start ---"
asuser "pm2 status"
echo ""
echo "Ports:"
ss -tlnp 2>&1 | grep -E ":(3000|3001)\b"
echo ""
echo "API health:"
curl -sS -i --max-time 8 http://localhost:3001/api/health 2>&1 | head -3
echo ""
echo "Dashboard:"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" --max-time 8 http://localhost:3000

# 6. Show journal so we can confirm clean start
echo ""
echo "--- 6. Latest journal entries ---"
journalctl -u "$UNIT" --no-pager -n 30 2>&1

echo ""
echo "=== DONE $(date) ==="
} > "$OUT" 2>&1

echo "Output: $OUT"
echo "View: https://spw-ai.com/fix-systemd-output.txt"
