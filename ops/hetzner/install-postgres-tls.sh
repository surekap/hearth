#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root" >&2
  exit 1
fi

domain="${1:-}"
case "$domain" in
  *.ts.net) ;;
  *)
    echo "Usage: $0 <machine-name.tailnet-name.ts.net>" >&2
    exit 1
    ;;
esac

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
container="hearth-postgres-1"
cert_dir="/var/lib/hearth/postgres-tls"
tailscale_ip="$(tailscale ip -4 | sed -n '1p')"
if [ -z "$tailscale_ip" ]; then
  echo "No Tailscale IPv4 address found" >&2
  exit 1
fi

if docker inspect "$container" >/dev/null 2>&1; then
  postgres_uid="$(docker exec "$container" id -u postgres)"
  postgres_gid="$(docker exec "$container" id -g postgres)"
else
  postgres_uid=70
  postgres_gid=70
fi

install -d -o root -g root -m 0755 "$cert_dir"
install -o root -g root -m 0755 \
  "$script_dir/hearth-postgres-tls-renew.sh" \
  /usr/local/sbin/hearth-postgres-tls-renew
install -o root -g root -m 0644 \
  "$script_dir/hearth-postgres-tls.service" \
  /etc/systemd/system/hearth-postgres-tls.service
install -o root -g root -m 0644 \
  "$script_dir/hearth-postgres-tls.timer" \
  /etc/systemd/system/hearth-postgres-tls.timer

config_tmp="$(mktemp)"
trap 'rm -f "$config_tmp"' EXIT HUP INT TERM
{
  printf 'TAILSCALE_CERT_DOMAIN=%s\n' "$domain"
  printf 'POSTGRES_TLS_DIR=%s\n' "$cert_dir"
  printf 'POSTGRES_TLS_ADDRESS=%s\n' "$tailscale_ip"
  printf 'POSTGRES_TLS_PORT=5432\n'
  printf 'POSTGRES_CONTAINER=%s\n' "$container"
  printf 'POSTGRES_USER=hearth\n'
  printf 'POSTGRES_DB=hearth\n'
  printf 'POSTGRES_UID=%s\n' "$postgres_uid"
  printf 'POSTGRES_GID=%s\n' "$postgres_gid"
} >"$config_tmp"
install -o root -g root -m 0600 "$config_tmp" /etc/default/hearth-postgres-tls

systemctl daemon-reload
systemctl enable --now hearth-postgres-tls.timer
systemctl start hearth-postgres-tls.service

echo "Hearth PostgreSQL certificate renewal installed for $domain"
echo "Set POSTGRES_SSL=on and POSTGRES_TLS_DIR=$cert_dir in /opt/hearth/.env, then recreate the postgres service."
