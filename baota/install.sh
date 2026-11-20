#!/usr/bin/env bash
set -euo pipefail
ROOT=/www/wwwroot/qudingtong
echo "==> 准备目录"
mkdir -p "$ROOT/data" "$ROOT/data/security" "$ROOT/backups"
if [ ! -f "$ROOT/.env" ]; then
  echo "==> 生成高强度随机密钥到 .env"
  SESSION_SECRET=$(openssl rand -hex 32)
  BACKUP_PEPPER=$(openssl rand -hex 32)
  AGENT_TOKEN=$(openssl rand -hex 24)
  cat > "$ROOT/.env" <<EOF
SESSION_SECRET=$SESSION_SECRET
QDT_BACKUP_PEPPER=$BACKUP_PEPPER
QDT_AGENT_TOKEN=$AGENT_TOKEN
# HTTP 默认 0；宝塔配置 HTTPS 后改成 1
QDT_SECURE_COOKIE=0
EOF
fi
chown -R www:www "$ROOT/data" "$ROOT/backups" "$ROOT/.env" 2>/dev/null || true
chmod 750 "$ROOT/data" "$ROOT/data/security" "$ROOT/backups" 2>/dev/null || true
chmod 600 "$ROOT/.env"
echo "==> 安装 systemd 服务"
cp deploy/baota/qudingtong.service /etc/systemd/system/qudingtong.service
systemctl daemon-reload
systemctl enable --now qudingtong
echo "==> 配置 Nginx 反向代理"
cp deploy/baota/qudingtong.nginx.conf /www/server/panel/vhost/nginx/qudingtong.conf
nginx -t && systemctl reload nginx || true
echo "完成：请打开 http://服务器IP:8282（建议宝塔面板配置 HTTPS 后把 .env 中 QDT_SECURE_COOKIE 改成 1）"
echo "打印代理 Token 已写入 $ROOT/.env 的 QDT_AGENT_TOKEN"
