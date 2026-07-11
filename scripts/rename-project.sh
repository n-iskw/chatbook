#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-project-name>" >&2
  exit 1
fi

NEW_NAME="$1"
OLD_NAME="fullstack-worker-template"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

grep -rl "$OLD_NAME" package.json wrangler.jsonc index.html .github/workflows/deploy.yml \
  | xargs sed -i.bak "s/${OLD_NAME}/${NEW_NAME}/g"
find . -maxdepth 2 -name "*.bak" -delete

COMPAT_DATE="$(date +%Y-%m-%d)"
sed -i.bak "s/\"compatibility_date\": \"[0-9-]*\"/\"compatibility_date\": \"${COMPAT_DATE}\"/" wrangler.jsonc
rm -f wrangler.jsonc.bak

echo "Renamed ${OLD_NAME} -> ${NEW_NAME}"
echo "compatibility_date -> ${COMPAT_DATE}"
echo ""
echo "Next: run 'wrangler d1 create ${NEW_NAME}-db' and put the resulting database_id into wrangler.jsonc"
