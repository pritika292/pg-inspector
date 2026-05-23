#!/usr/bin/env bash
# Run on the VM (via `az vm run-command invoke`) before docker compose up.
# Idempotent — safe to re-run on every deploy.
#
# Responsibilities:
#   1. Fetch pg-inspector-ro-password, pg-inspector-admin-password, and
#      openai-api-key from Azure Key Vault via the VM's Managed Identity.
#   2. Ensure the pg_scenarios DB and the two project-scoped roles exist
#      (pg_inspector_admin owns objects + runs migrations + seeds;
#       pg_inspector_ro is the HTTP server's only DB identity).
#   3. Write /opt/pritika/_infra/pg-inspector.env (mode 600) so docker
#      compose can env_file it.
#
# Reads POSTGRES_PASSWORD from /opt/pritika/_infra/.env. That file is
# materialized by an earlier setup-vm.sh (pre-dating this repo) and contains
# the postgres superuser password.

set -euo pipefail

VAULT="${VAULT:-pritika-portfolio-kv}"
INFRA_ENV="/opt/pritika/_infra/.env"
PROJECT_ENV="/opt/pritika/_infra/pg-inspector.env"

log() { printf "[bootstrap-pg-inspector] %s\n" "$*"; }

if [ ! -f "$INFRA_ENV" ]; then
  echo "ERROR: $INFRA_ENV not found — VM is not yet bootstrapped for the portfolio stack." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
. "$INFRA_ENV"
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: POSTGRES_PASSWORD missing from $INFRA_ENV" >&2
  exit 1
fi

log "Logging in with Managed Identity to read Key Vault secrets"
az login --identity --output none

fetch() {
  az keyvault secret show --vault-name "$VAULT" --name "$1" --query value -o tsv
}

RO_PWD="$(fetch pg-inspector-ro-password)"
ADMIN_PWD="$(fetch pg-inspector-admin-password)"
OPENAI_KEY="$(fetch openai-api-key || echo "sk-placeholder-replace-me")"

if [ -z "$RO_PWD" ] || [ -z "$ADMIN_PWD" ]; then
  echo "ERROR: required Key Vault secrets are missing" >&2
  exit 1
fi

# Helper that runs a single SQL statement as the postgres superuser.
psql_admin() {
  PGPASSWORD="$POSTGRES_PASSWORD" docker exec -i \
    -e PGPASSWORD pritika-postgres psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

log "Ensuring database 'pg_scenarios' exists"
if psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname='pg_scenarios'" | grep -q 1; then
  log "  already present"
else
  psql_admin -c "CREATE DATABASE pg_scenarios"
  log "  created"
fi

# Single CREATE-or-ALTER statement so password rotation works without a
# manual DROP. We DO NOT log the passwords themselves.
log "Ensuring role pg_inspector_admin exists with current Key Vault password"
psql_admin <<SQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pg_inspector_admin') THEN
    CREATE ROLE pg_inspector_admin LOGIN PASSWORD '${ADMIN_PWD}';
  ELSE
    ALTER ROLE pg_inspector_admin WITH LOGIN PASSWORD '${ADMIN_PWD}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE pg_scenarios TO pg_inspector_admin;
GRANT CREATE ON DATABASE pg_scenarios TO pg_inspector_admin;
SQL

log "Ensuring role pg_inspector_ro exists with current Key Vault password"
psql_admin <<SQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pg_inspector_ro') THEN
    CREATE ROLE pg_inspector_ro LOGIN PASSWORD '${RO_PWD}';
  ELSE
    ALTER ROLE pg_inspector_ro WITH LOGIN PASSWORD '${RO_PWD}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE pg_scenarios TO pg_inspector_ro;
SQL

# Note: schema-level USAGE + SELECT grants happen inside migration 001
# (Epic 2.2), which knows the names of the 21 scenario sub-schemas. Doing
# the grants here would require this script to know that list, coupling
# ops to schema design. Cleaner to keep schema work in migrations.

log "Writing $PROJECT_ENV (mode 600)"
umask 077
cat > "$PROJECT_ENV" <<EOF
NODE_ENV=production
PORT=3014
DATABASE_URL=postgres://pg_inspector_ro:${RO_PWD}@pritika-postgres:5432/pg_scenarios
ADMIN_DATABASE_URL=postgres://pg_inspector_admin:${ADMIN_PWD}@pritika-postgres:5432/pg_scenarios
REDIS_URL=redis://pritika-redis:6379/13
OPENAI_API_KEY=${OPENAI_KEY}
LOG_LEVEL=info
EOF

log "Bootstrap complete"
