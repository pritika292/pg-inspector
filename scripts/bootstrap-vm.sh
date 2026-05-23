#!/usr/bin/env bash
# Run on the VM (via `az vm run-command invoke`) before docker compose up.
# Idempotent — safe to re-run on every deploy.
#
# All Azure I/O uses the VM's System-Assigned Managed Identity. No keys, no
# API credentials, no secret values ever leave the Azure trust boundary.
#
# Responsibilities:
#   1. Use Managed Identity to fetch the two Postgres role passwords from
#      Key Vault (inspector-ro-password, inspector-admin-password).
#   2. Ensure pg_scenarios DB + two project-scoped Postgres roles exist.
#   3. Write /opt/pritika/_infra/pg-inspector.env (mode 600) with the role
#      DSNs + the Azure OpenAI endpoint & deployment names. There is NO AI
#      key in this file — the running container uses Managed Identity via
#      @azure/identity to call Azure OpenAI.
#
# Reads POSTGRES_PASSWORD from /opt/pritika/_infra/.env (postgres superuser,
# the only thing here that came in pre-VM-identity and is still file-based).
#
# psql output is silenced (-q + redirects + warning-only) so no password
# literal can leak through error messages.

set -euo pipefail

VAULT="${VAULT:-pritika-portfolio-kv}"
AZURE_OPENAI_RESOURCE="${AZURE_OPENAI_RESOURCE:-pritika-ai}"
AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:-gpt-4.1-mini}"
AZURE_OPENAI_API_VERSION="${AZURE_OPENAI_API_VERSION:-2024-12-01-preview}"
INFRA_ENV="/opt/pritika/_infra/.env"
PROJECT_ENV="/opt/pritika/_infra/pg-inspector.env"

log() { printf "[bootstrap-pg-inspector] %s\n" "$*"; }
die() { printf "[bootstrap-pg-inspector] ERROR: %s\n" "$*" >&2; exit 1; }

[ -f "$INFRA_ENV" ] || die "$INFRA_ENV not found — VM portfolio stack not bootstrapped"

set -a
# shellcheck source=/dev/null
. "$INFRA_ENV"
set +a

[ -n "${POSTGRES_PASSWORD:-}" ] || die "POSTGRES_PASSWORD missing from $INFRA_ENV"
command -v az >/dev/null || die "az CLI not installed on VM (apt-get install azure-cli)"

log "Logging in with VM Managed Identity"
az login --identity --output none

fetch_kv() {
  # --query value -o tsv to avoid pretty-printed wrappers; stderr to /dev/null
  # so credential-style noise doesn't pollute logs.
  az keyvault secret show --vault-name "$VAULT" --name "$1" --query value -o tsv 2>/dev/null
}

RO_PWD="$(fetch_kv inspector-ro-password)"
ADMIN_PWD="$(fetch_kv inspector-admin-password)"

[ -n "$RO_PWD" ]    || die "inspector-ro-password missing in Key Vault"
[ -n "$ADMIN_PWD" ] || die "inspector-admin-password missing in Key Vault"

# Resolve the Azure OpenAI endpoint via control-plane (no AI-side key needed).
log "Resolving Azure OpenAI endpoint for $AZURE_OPENAI_RESOURCE"
AZURE_OPENAI_ENDPOINT="$(
  az cognitiveservices account show \
    --name "$AZURE_OPENAI_RESOURCE" \
    --resource-group "$(az resource list --name "$AZURE_OPENAI_RESOURCE" --query '[0].resourceGroup' -o tsv)" \
    --query properties.endpoint -o tsv 2>/dev/null
)"
[ -n "$AZURE_OPENAI_ENDPOINT" ] || die "Could not resolve $AZURE_OPENAI_RESOURCE endpoint"

psql_admin() {
  PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
    -e PGPASSWORD pritika-postgres \
    psql -U postgres -q -v ON_ERROR_STOP=1 \
    --set "client_min_messages=warning" "$@" \
    >/dev/null
}

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

# Use psql variable substitution so the password is quoted client-side; it
# never appears in the heredoc literal and never reaches Postgres's error
# echo path.
ensure_role() {
  local role="$1"
  local pwd="$2"
  local action
  if [ "$(psql_check "SELECT 1 FROM pg_roles WHERE rolname='$role'")" = "1" ]; then
    action=ALTER
  else
    action=CREATE
  fi
  log "  ${action} role '$role'"
  printf "%s ROLE %s WITH LOGIN PASSWORD :'pwd';\nGRANT CONNECT ON DATABASE pg_scenarios TO %s;\n" \
    "$action" "$role" "$role" \
    | PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
        -e PGPASSWORD pritika-postgres \
        psql -U postgres -q -v ON_ERROR_STOP=1 \
        --set "client_min_messages=warning" \
        --set "pwd=$pwd" >/dev/null 2>&1
}

log "Ensuring role 'inspector_admin'"
ensure_role inspector_admin "$ADMIN_PWD"
psql_admin -d pg_scenarios -c "GRANT CREATE ON DATABASE pg_scenarios TO inspector_admin"
# Postgres 15+ removed CREATE on schema public from the public role. Give it
# back to inspector_admin so the migration runner can create _migrations and
# _seed_marker tables (they live in public).
psql_admin -d pg_scenarios -c "GRANT CREATE, USAGE ON SCHEMA public TO inspector_admin"

log "Ensuring role 'inspector_ro'"
ensure_role inspector_ro "$RO_PWD"
# Same story for the read-only role: needs USAGE on public + SELECT on the
# meta tables so health/diagnostics queries can read _migrations and
# _seed_marker. Per-table SELECT happens via the default privileges set
# inside migration 001 for the scenario schemas; for public we grant here.
psql_admin -d pg_scenarios -c "GRANT USAGE ON SCHEMA public TO inspector_ro"
psql_admin -d pg_scenarios -c "ALTER DEFAULT PRIVILEGES FOR ROLE inspector_admin IN SCHEMA public GRANT SELECT ON TABLES TO inspector_ro"

# Schema-level USAGE + SELECT grants happen inside migration 001 (Epic 2.2).

log "Writing $PROJECT_ENV (mode 600)"
umask 077
cat > "$PROJECT_ENV" <<EOF
NODE_ENV=production
PORT=3014
DATABASE_URL=postgres://inspector_ro:${RO_PWD}@pritika-postgres:5432/pg_scenarios
ADMIN_DATABASE_URL=postgres://inspector_admin:${ADMIN_PWD}@pritika-postgres:5432/pg_scenarios
REDIS_URL=redis://pritika-redis:6379/13
AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT}
AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT}
AZURE_OPENAI_API_VERSION=${AZURE_OPENAI_API_VERSION}
LOG_LEVEL=info
EOF

log "Bootstrap complete"
