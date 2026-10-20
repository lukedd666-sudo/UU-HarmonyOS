#!/usr/bin/env bash
set -euo pipefail

UU_REA_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$UU_REA_ROOT"

# Offline checks only: no credentials, network requests or device operations.
npm --prefix web test
npm --prefix web run typecheck
for UU_REA_CHECK in policy transport signing session; do
  node "scripts/harmony-${UU_REA_CHECK}-check.cjs"
done
