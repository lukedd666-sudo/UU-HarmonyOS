#!/usr/bin/env bash
set -euo pipefail

UU_REA_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$UU_REA_ROOT"

if [[ ! -d web/node_modules ]]; then
  echo 'Run npm --prefix web ci --ignore-scripts before building.' >&2
  exit 1
fi
npm --prefix web run build
mkdir -p entry/src/main/resources/rawfile
cp -R web/dist/. entry/src/main/resources/rawfile/
exec "$UU_REA_ROOT/scripts/harmony-build.sh" "$@"
