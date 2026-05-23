#!/usr/bin/env bash
# Run on the VM (via `az vm run-command invoke`) before docker compose up.
# Idempotent — safe to re-run on every deploy.
#
# Responsibilities:
#   1. Ensure the pg_scenarios DB and two project-scoped Postgres roles exist
#      (inspector_admin owns objects + runs migrations + seeds;
#       inspector_ro is the HTTP server's only DB identity).
#   2. Write /opt/pritika/_infra/pg-inspector.env (mode 600) so docker
#      compose can env_file it.
#
# Secrets are passed IN via env vars from the local az-driven deploy script:
#   - INSPECTOR_RO_PWD       (the read-only role's password)
#   - INSPECTOR_ADMIN_PWD    (the admin role's password — used by migrate+seed)
#   - OPENAI_KEY             (fed into the env file; the boot guard verifies it)
#
# Plus from the shared /opt/pritika/_infra/.env:
#   - POSTGRES_PASSWORD      (postgres superuser, used to CREATE DB + ROLE)
#
# psql output is silenced (-q + redirect) so no role/password literal ever
# reaches stdout/stderr. If a psql statement fails, ON_ERROR_STOP aborts the
# script with a non-zero exit and a generic message; root-cause investigation
# happens by running the script locally with set -x against a scratch DB.

set -euo pipefail

INFRA_ENV="/opt/pritika/_infra/.env"
PROJECT_ENV="/opt/pritika/_infra/pg-inspector.env"

log() { printf "[bootstrap-pg-inspector] %s\n" "$*"; }
die() { printf "[bootstrap-pg-inspector] ERROR: %s\n" "$*" >&2; exit 1; }

[ -f "$INFRA_ENV" ] || die "$INFRA_ENV not found — VM portfolio stack not bootstrapped"

set -a
# shellcheck source=/dev/null
. "$INFRA_ENV"
set +a

[ -n "${POSTGRES_PASSWORD:-}" ]    || die "POSTGRES_PASSWORD missing from $INFRA_ENV"
[ -n "${INSPECTOR_RO_PWD:-}" ]     || die "INSPECTOR_RO_PWD env var not set by caller"
[ -n "${INSPECTOR_ADMIN_PWD:-}" ]  || die "INSPECTOR_ADMIN_PWD env var not set by caller"
[ -n "${OPENAI_KEY:-}" ]           || die "OPENAI_KEY env var not set by caller"

# psql wrapper. Quiet + ON_ERROR_STOP + ignore notice/info noise. stdout
# discarded; stderr redacted so no SQL literal ever surfaces.
psql_admin() {
  PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
    -e PGPASSWORD pritika-postgres \
    psql -U postgres -q -v ON_ERROR_STOP=1 \
    --set "client_min_messages=warning" "$@" \
    >/dev/null
}

# Same wrapper but for cases where we want to inspect the result (true/false
# style checks). Output still suppressed in error case.
psql_check() {
  PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
    -e PGPASSWORD pritika-postgres \
    psql -U postgres -tAc "$1"
}

log "Ensuring database 'pg_scenarios' exists"
if [ "$(psql_check "SELECT 1 FROM pg_database WHERE datname='pg_scenarios'")" = "1" ]; then
  log "  already present"
else
  psql_admin -c "CREATE DATABASE pg_scenarios"
  log "  created"
fi

ensure_role() {
  local role="$1"
  local pwd="$2"

  if [ "$(psql_check "SELECT 1 FROM pg_roles WHERE rolname='$role'")" = "1" ]; then
    log "  role '$role' present; rotating password to current Key Vault value"
    # Use psql variable substitution so the password is quoted by psql, not
    # interpolated into the heredoc. :'name' wraps in single quotes safely.
    printf "ALTER ROLE %s WITH LOGIN PASSWORD :'pwd';\nGRANT CONNECT ON DATABASE pg_scenarios TO %s;\n" "$role" "$role" \
      | PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
          -e PGPASSWORD pritika-postgres \
          psql -U postgres -q -v ON_ERROR_STOP=1 \
          --set "client_min_messages=warning" \
          --set "pwd=$pwd" >/dev/null 2>&1
  else
    log "  creating role '$role'"
    printf "CREATE ROLE %s WITH LOGIN PASSWORD :'pwd';\nGRANT CONNECT ON DATABASE pg_scenarios TO %s;\n" "$role" "$role" \
      | PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
          -e PGPASSWORD pritika-postgres \
          psql -U postgres -q -v ON_ERROR_STOP=1 \
          --set "client_min_messages=warning" \
          --set "pwd=$pwd" >/dev/null 2>&1
  fi
}

log "Ensuring role 'inspector_admin'"
ensure_role inspector_admin "$INSPECTOR_ADMIN_PWD"
psql_admin -d pg_scenarios -c "GRANT CREATE ON DATABASE pg_scenarios TO inspector_admin"

log "Ensuring role 'inspector_ro'"
ensure_role inspector_ro "$INSPECTOR_RO_PWD"

# Schema-level USAGE + SELECT grants happen inside migration 001 (Epic 2.2),
# which knows the names of the 21 scenario sub-schemas.

log "Writing $PROJECT_ENV (mode 600)"
umask 077
cat > "$PROJECT_ENV" <<EOF
NODE_ENV=production
PORT=3014
DATABASE_URL=postgres://inspector_ro:${INSPECTOR_RO_PWD}@pritika-postgres:5432/pg_scenarios
ADMIN_DATABASE_URL=postgres://inspector_admin:${INSPECTOR_ADMIN_PWD}@pritika-postgres:5432/pg_scenarios
REDIS_URL=redis://pritika-redis:6379/13
OPENAI_API_KEY=${OPENAI_KEY}
LOG_LEVEL=info
EOF

log "Bootstrap complete"
