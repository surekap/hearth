#!/bin/sh
set -eu

: "${TAILSCALE_CERT_DOMAIN:?Set TAILSCALE_CERT_DOMAIN}"
: "${POSTGRES_TLS_DIR:?Set POSTGRES_TLS_DIR}"
: "${POSTGRES_TLS_ADDRESS:?Set POSTGRES_TLS_ADDRESS}"
: "${POSTGRES_TLS_PORT:?Set POSTGRES_TLS_PORT}"
: "${POSTGRES_CONTAINER:?Set POSTGRES_CONTAINER}"
: "${POSTGRES_USER:?Set POSTGRES_USER}"
: "${POSTGRES_DB:?Set POSTGRES_DB}"
: "${POSTGRES_UID:?Set POSTGRES_UID}"
: "${POSTGRES_GID:?Set POSTGRES_GID}"

case "$TAILSCALE_CERT_DOMAIN" in
  *.ts.net) ;;
  *)
    echo "Refusing non-Tailscale certificate domain: $TAILSCALE_CERT_DOMAIN" >&2
    exit 1
    ;;
esac

case "$POSTGRES_TLS_DIR" in
  /var/lib/hearth/postgres-tls) ;;
  *)
    echo "Refusing unexpected certificate directory: $POSTGRES_TLS_DIR" >&2
    exit 1
    ;;
esac

install -d -o root -g root -m 0755 "$POSTGRES_TLS_DIR"
tmp_dir="$(mktemp -d "$POSTGRES_TLS_DIR/.renew.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

tailscale cert \
  --min-validity=720h \
  --cert-file="$tmp_dir/server.crt" \
  --key-file="$tmp_dir/server.key" \
  "$TAILSCALE_CERT_DOMAIN"

openssl x509 -in "$tmp_dir/server.crt" -noout -checkend 604800
openssl x509 -in "$tmp_dir/server.crt" -noout -checkhost "$TAILSCALE_CERT_DOMAIN"
openssl pkey -in "$tmp_dir/server.key" -noout -check

cert_public_key="$(openssl x509 -in "$tmp_dir/server.crt" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | awk '{print $1}')"
key_public_key="$(openssl pkey -in "$tmp_dir/server.key" -pubout -outform DER | sha256sum | awk '{print $1}')"
if [ "$cert_public_key" != "$key_public_key" ]; then
  echo "Certificate and private key do not match" >&2
  exit 1
fi

install -o "$POSTGRES_UID" -g "$POSTGRES_GID" -m 0644 "$tmp_dir/server.crt" "$POSTGRES_TLS_DIR/server.crt.next"
install -o "$POSTGRES_UID" -g "$POSTGRES_GID" -m 0600 "$tmp_dir/server.key" "$POSTGRES_TLS_DIR/server.key.next"
mv -f "$POSTGRES_TLS_DIR/server.crt.next" "$POSTGRES_TLS_DIR/server.crt"
mv -f "$POSTGRES_TLS_DIR/server.key.next" "$POSTGRES_TLS_DIR/server.key"

if docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  docker kill --signal HUP "$POSTGRES_CONTAINER" >/dev/null
  ssl_enabled="$(docker exec "$POSTGRES_CONTAINER" psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc 'SHOW ssl' 2>/dev/null || true)"
  if [ "$ssl_enabled" = "on" ]; then
    verified=false
    attempt=1
    while [ "$attempt" -le 10 ]; do
      if timeout 10 openssl s_client \
        -starttls postgres \
        -connect "$POSTGRES_TLS_ADDRESS:$POSTGRES_TLS_PORT" \
        -servername "$TAILSCALE_CERT_DOMAIN" \
        -verify_hostname "$TAILSCALE_CERT_DOMAIN" \
        -verify_return_error </dev/null >/dev/null 2>&1; then
        verified=true
        break
      fi
      attempt=$((attempt + 1))
      sleep 1
    done
    if [ "$verified" != "true" ]; then
      echo "PostgreSQL TLS verification failed after certificate reload" >&2
      exit 1
    fi
  fi
fi

openssl x509 -in "$POSTGRES_TLS_DIR/server.crt" -noout -subject -issuer -enddate
