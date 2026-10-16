#!/usr/bin/env bash
set -euo pipefail

UU_REA_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UU_REA_DEVECO="${UU_REA_DEVECO:-/Applications/DevEco-Studio.app/Contents}"
export NODE_HOME="$UU_REA_DEVECO/tools/node"
export JAVA_HOME="$UU_REA_DEVECO/jbr/Contents/Home"
export DEVECO_SDK_HOME="$UU_REA_DEVECO/sdk"
export PATH="$NODE_HOME/bin:$JAVA_HOME/bin:$PATH"

for UU_REA_TOOL in "$NODE_HOME/bin/node" "$JAVA_HOME/bin/java" "$UU_REA_DEVECO/tools/hvigor/bin/hvigorw"; do
  if [[ ! -x "$UU_REA_TOOL" ]]; then
    echo "Missing bundled build tool: $UU_REA_TOOL" >&2
    exit 1
  fi
done
cd "$UU_REA_ROOT"
# No signing profile or account certificate is copied. Produces an unsigned HAP.
exec "$UU_REA_DEVECO/tools/hvigor/bin/hvigorw" --mode module -p product=default -p module=entry@default -p buildMode=release assembleHap --no-daemon "$@"
