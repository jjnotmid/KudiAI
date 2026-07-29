#!/usr/bin/env bash
# Objective quality gate (§9). Must exit 0. e2e and eval are added as those
# harnesses land (see docs/TASKS.md).
set -euo pipefail

echo "▸ typecheck";      npx tsc --noEmit
echo "▸ lint";           npm run lint
echo "▸ unit tests";     npm run test:unit
echo "▸ contract tests"; npm run test:contract
echo "▸ build";          npm run build

echo "✓ verify passed"
