# Deploying Hearth to `hetzner-docker`

> **Which Compose files production actually uses.** The live server is deployed with
> plain `docker compose` commands, which load `docker-compose.yml` plus the
> server-local, Git-ignored `docker-compose.override.yml`. That override is the real
> production proxy configuration — it serves **two** hostnames
> (`hearth.sureka.family` and `health.sureka.family`) and carries
> `LETSENCRYPT_EMAIL` inline.
>
> `docker-compose.production.yml` is **not** in use: it declares a single hostname and
> requires `VIRTUAL_HOST` / `LETSENCRYPT_EMAIL` in `.env`, which the server does not
> set, so `docker compose -f docker-compose.yml -f docker-compose.production.yml
> config` fails outright. Do not deploy with it unless you first reconcile the two —
> doing so would drop `health.sureka.family`.

Hearth is deployed as two Docker Compose services on the SSH host
`hetzner-docker`:

- `app`: the Next.js production server on port 3000
- `postgres`: Postgres 17 with the named volume `hearth-postgres`

Uploaded reports and extracted clinical images are encrypted before they are written to
`/app/storage`. That path is bind-mounted from
`/mnt/storagebox/hearth/storage` on the host. The host's shared `nginx-proxy` and ACME
containers terminate HTTPS and route both `hearth.sureka.family` and
`health.sureka.family` to the app container over the external Docker network `net`.

## Prerequisites

From the development machine, confirm the SSH alias and Docker installation:

```bash
ssh hetzner-docker
docker version
docker compose version
```

The deployment directory is `/opt/hearth`. The external proxy network and Storage Box
mount must exist before the first start:

```bash
docker network inspect net >/dev/null
findmnt /mnt/storagebox
test -d /mnt/storagebox/hearth/storage
```

Do not start the app if `findmnt` fails. Otherwise Docker can write uploads to the host's
root disk instead of the Storage Box.

## Production environment

Create `/opt/hearth/.env` on the server. It is intentionally ignored by Git and must not
be copied into an image or committed. Use strong, unique values; this is a template, not
a working configuration:

```dotenv
AUTH_TRUST_HOST=true
AUTH_URL=https://hearth.sureka.family
NEXTAUTH_URL=https://hearth.sureka.family
NEXT_PUBLIC_APP_URL=https://hearth.sureka.family

POSTGRES_DB=hearth
POSTGRES_USER=hearth
POSTGRES_PASSWORD=replace-with-a-long-random-password
POSTGRES_BIND_ADDRESS=100.94.241.10
POSTGRES_PORT=5432
POSTGRES_SSL=on
POSTGRES_TLS_DIR=/var/lib/hearth/postgres-tls

AUTH_SECRET=replace-with-openssl-rand-base64-32-output
DOCUMENT_ENCRYPTION_KEY=replace-with-openssl-rand-hex-32-output
CRON_SECRET=replace-with-another-long-random-value

HEARTH_STORAGE_DIR=/mnt/storagebox/hearth/storage
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=3000

SEED_USER_EMAIL=admin@example.com
SEED_USER_PASSWORD=replace-with-a-long-random-password
SEED_USER_NAME=Admin

EXTRACTION_PROVIDER=openai
OPENAI_API_KEY=replace-with-the-api-key
OPENAI_MODEL=gpt-4o
EXTRACTION_MODEL=
REASONING_MODEL=

VIRTUAL_HOST=hearth.sureka.family
LETSENCRYPT_HOST=hearth.sureka.family
LETSENCRYPT_EMAIL=admin@example.com
PROXY_NETWORK=net
```

Generate secrets on a trusted machine:

```bash
openssl rand -base64 32
openssl rand -hex 32
openssl rand -base64 32
```

The 64-character hex value is `DOCUMENT_ENCRYPTION_KEY`. Back it up separately from the
database and Storage Box. Changing or losing this key makes every existing stored report
and scan unreadable. `NEXT_PUBLIC_APP_URL` is included at image build time, so rebuild the
image after changing it.

If Health Bridge should not connect directly to Postgres, use
`POSTGRES_BIND_ADDRESS=127.0.0.1`. If it does connect over Tailscale, keep the Tailscale
address and install the existing certificate renewal service once:

```bash
cd /opt/hearth
sudo ./ops/hetzner/install-postgres-tls.sh hetzner-docker.tail95d995.ts.net
```

## Put the code on the server

Use one deployment method consistently.

### Git checkout (preferred)

Commit and push the release first. On the server, require a clean checkout and fast-forward
it to the selected revision:

```bash
ssh hetzner-docker
cd /opt/hearth
test -z "$(git status --porcelain)" || { echo "Refusing to deploy a dirty checkout"; exit 1; }
git fetch origin main
git merge --ff-only origin/main
```

### File sync (for an intentionally server-modified checkout)

Run this from the repository root on the development machine. The exclusions preserve
server secrets, Git metadata, generated data, and the server-local legacy Compose override.
Review the exact destination before using `--delete`.

```bash
rsync -az --delete \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='storage/' \
  --exclude='backups/' \
  --exclude='docker-compose.override.yml' \
  ./ hetzner-docker:/opt/hearth/
```

Keep `docker-compose.override.yml` excluded from the sync: it is the live proxy
configuration, not a stale leftover, and the deployment depends on it.

## Build and release

Back up the database before a schema-changing release, then validate the effective Compose
configuration, build, and recreate the services:

```bash
ssh hetzner-docker
cd /opt/hearth

install -d -m 0700 /opt/hearth/backups
docker compose \
  exec -T postgres sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "/opt/hearth/backups/hearth-$(date +%Y%m%d-%H%M%S).dump"

docker compose config --quiet
docker compose build --pull app
docker compose up -d
```

The app container waits for Postgres, applies the Drizzle schema, runs the conversation
backfill and seed idempotently, then starts `next start`. Expect a short interruption while
the app container is replaced. Postgres and encrypted document storage are not recreated.

## Verify the release

```bash
cd /opt/hearth
docker compose ps
docker compose logs --tail=200 app
curl -fsS http://127.0.0.1:3000/login >/dev/null
curl -fsS https://hearth.sureka.family/login >/dev/null
```

The app service should become `healthy`. Also sign in and verify that an existing report
opens; that exercises the database, encryption key, and Storage Box mount together.

## Routine operations

View logs or restart only the application:

```bash
cd /opt/hearth
docker compose logs -f app
docker compose restart app
```

Inspect disk and database usage:

```bash
du -sh /mnt/storagebox/hearth/storage
docker system df
docker compose \
  exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select pg_size_pretty(pg_database_size(current_database()));"'
```

## Backups

A recoverable backup consists of all three items:

1. A Postgres dump.
2. The complete `/mnt/storagebox/hearth/storage` tree.
3. The exact `DOCUMENT_ENCRYPTION_KEY` stored in a separate secret manager.

Create a database dump with the command in the release procedure and copy it off-host.
Use Storage Box snapshots or another independent backup for the encrypted file tree. Test
restores periodically; having files without the database metadata or encryption key is not
sufficient.

## Rollback

Application rollback is code-only: select the last known-good commit or synced release,
rebuild `app`, and run `up -d` again. Do not delete the Postgres volume or Storage Box files.

If the failed release changed the schema incompatibly, stop the app and restore the matching
pre-deployment database dump before starting the older image. Schema rollback is not
automatic because `docker/start.sh` only applies forward schema state.

## Troubleshooting

- `app` never becomes healthy: inspect `docker compose ... logs app`; startup failures are
  commonly a database connection, schema, or missing-secret problem.
- Uploads fail with filesystem errors: verify `findmnt /mnt/storagebox` and permissions on
  `/mnt/storagebox/hearth/storage` before restarting.
- HTTPS returns 502: verify the app is attached to the external `net` network and that
  `VIRTUAL_HOST` matches the requested hostname.
- Existing reports cannot open after a deployment: stop and verify
  `DOCUMENT_ENCRYPTION_KEY`; do not generate a replacement key.
- Metadata or generated upload URLs show localhost: set all three public/auth URL variables
  and rebuild the image.
