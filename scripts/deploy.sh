#!/usr/bin/env bash
# Trigger a deploy on the VM. Pulls the latest main, runs bootstrap-vm.sh
# (which fetches Key Vault secrets via Managed Identity on the VM side),
# then docker compose up + health probe.
#
# No secrets cross this script's process. Everything sensitive stays inside
# Azure's trust boundary, fetched on the VM via its System-Assigned Managed
# Identity. Local az is only used to *trigger* the VM run-command.

set -euo pipefail

RG="${AZURE_DEPLOY_RG:-pritika-portfolio-rg}"
VM="${AZURE_DEPLOY_VM_NAME:-pritika-portfolio-vm}"

command -v az >/dev/null || { echo "missing tool: az" >&2; exit 1; }

INLINE_SCRIPT=$(cat <<'OUTER'
bash -c '
set -euo pipefail

TARGET=/opt/pritika/pg-inspector
REPO=https://github.com/pritika292/pg-inspector.git

if [ ! -d "$TARGET/.git" ]; then
  rm -rf "$TARGET"
  git clone --depth 1 "$REPO" "$TARGET"
else
  cd "$TARGET"
  git fetch --depth 1 origin main
  git reset --hard origin/main
fi

cd "$TARGET"
echo "[deploy] HEAD: $(git rev-parse --short HEAD) - $(git log -1 --format=%s)"

chmod +x scripts/bootstrap-vm.sh
bash scripts/bootstrap-vm.sh

echo "[deploy] docker compose up -d --build"
docker compose up -d --build 2>&1 | tail -15

echo "[deploy] waiting for container health"
for i in $(seq 1 45); do
  status=$(docker inspect -f "{{.State.Health.Status}}" pg-inspector 2>/dev/null || echo "missing")
  echo "  attempt $i: $status"
  if [ "$status" = "healthy" ]; then break; fi
  sleep 2
done

echo "[deploy] internal health probe"
curl -fsS http://localhost:3014/health
echo
'
OUTER
)

echo "[deploy] invoking az vm run-command (this takes ~60s)"
az vm run-command invoke \
  --resource-group "$RG" \
  --name "$VM" \
  --command-id RunShellScript \
  --scripts "$INLINE_SCRIPT" \
  --query "value[0].message" -o tsv
