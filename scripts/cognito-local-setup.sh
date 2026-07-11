#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENDPOINT="http://localhost:9229"

cd "$ROOT_DIR/terraform"
terraform init -input=false
terraform apply -input=false -auto-approve -var-file=local.tfvars

USER_POOL_ID="$(terraform output -raw user_pool_id)"
CLIENT_ID="$(terraform output -raw client_id)"

cd "$ROOT_DIR"

cat >.dev.vars <<EOF
COGNITO_ISSUER=${ENDPOINT}/${USER_POOL_ID}
COGNITO_CLIENT_ID=${CLIENT_ID}
EOF

cat >.env.local <<EOF
VITE_COGNITO_USER_POOL_ID=${USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${CLIENT_ID}
VITE_COGNITO_ENDPOINT=${ENDPOINT}
EOF

echo "cognito-local bootstrap complete:"
echo "  User Pool ID: ${USER_POOL_ID}"
echo "  Client ID:    ${CLIENT_ID}"
echo "  Test user:    test@example.com / Passw0rd1!"
echo "Wrote .dev.vars and .env.local"
