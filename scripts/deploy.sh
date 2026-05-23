#!/usr/bin/env bash
# Local-driven deploy.
#
# Pulls the three pg-inspector secrets from Azure Key Vault using the local
# user's already-authenticated `az` session, then runs the VM bootstrap +
# docker compose up via `az vm run-command invoke`. The secret values are
# embedded in the inline script — script content is NOT logged by Azure
# Activity Log (only stdout/stderr are, and bootstrap-vm.sh is written so
# nothing sensitive reaches either stream).
#
# Why we don't use Managed Identity on the VM:
#   - That requires installing `az` CLI on the VM (~150MB).
#   - The user already has `az` locally, and the secrets transit Azure's
#     internal network in both cases — the realized exposure surface is the
#     same for our portfolio scale.

set -euo pipefail

RG="${AZURE_DEPLOY_RG:-pritika-portfolio-rg}"
VM="${AZURE_DEPLOY_VM_NAME:-pritika-portfolio-vm}"
VAULT="${VAULT:-pritika-portfolio-kv}"

require() { command -v "$1" >/dev/null || { echo "missing tool: $1" >&2; exit 1; }; }
require az
require jq

echo "[deploy] fetching secrets from $VAULT"
RO_PWD=$(az keyvault secret show --vault-name "$VAULT" --name inspector-ro-password --query value -o tsv)
ADMIN_PWD=$(az keyvault secret show --vault-name "$VAULT" --name inspector-admin-password --query value -o tsv)
OPENAI_KEY=$(az keyvault secret show --vault-name "$VAULT" --name openai-api-key --query value -o tsv)

[ -n "$RO_PWD" ]      || { echo "inspector-ro-password empty" >&2; exit 1; }
[ -n "$ADMIN_PWD" ]   || { echo "inspector-admin-password empty" >&2; exit 1; }
[ -n "$OPENAI_KEY" ]  || { echo "openai-api-key empty" >&2; exit 1; }

# Build the inline script. Single-quote the heredoc so local shell doesn't
# interpolate; do the value substitution inside via printf %q-style quoting.
INLINE_SCRIPT=$(cat <<OUTER
bash -c '
set -euo pipefail
export INSPECTOR_RO_PWD=$(printf %q "$RO_PWD")
export INSPECTOR_ADMIN_PWD=$(printf %q "$ADMIN_PWD")
export OPENAI_KEY=$(printf %q "$OPENAI_KEY")

TARGET=/opt/pritika/pg-inspector
REPO=https://github.com/pritika292/pg-inspector.git

if [ ! -d "\$TARGET/.git" ]; then
  rm -rf "\$TARGET"
  git clone --depth 1 "\$REPO" "\$TARGET"
else
  cd "\$TARGET"
  git fetch --depth 1 origin main
  git reset --hard origin/main
fi

cd "\$TARGET"
echo "[deploy] HEAD: \$(git rev-parse --short HEAD) - \$(git log -1 --format=%s)"

chmod +x scripts/bootstrap-vm.sh
bash scripts/bootstrap-vm.sh

echo "[deploy] docker compose up -d --build"
docker compose up -d --build 2>&1 | tail -15

echo "[deploy] waiting for container health"
for i in \$(seq 1 45); do
  status=\$(docker inspect -f "{{.State.Health.Status}}" pg-inspector 2>/dev/null || echo "missing")
  echo "  attempt \$i: \$status"
  if [ "\$status" = "healthy" ]; then break; fi
  sleep 2
done

echo "[deploy] health probe from VM"
curl -fsS http://localhost:3014/health
echo
'
OUTER
)

echo "[deploy] invoking az vm run-command (this can take ~60s)"
az vm run-command invoke \
  --resource-group "$RG" \
  --name "$VM" \
  --command-id RunShellScript \
  --scripts "$INLINE_SCRIPT" \
  --query "value[0].message" -o tsv
