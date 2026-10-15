#!/usr/bin/env bash
# Build the macOS app and sign it with one stable identity.
# Order: CSC_NAME, then Apple Development on this Mac, then
# "Zhida Assistant Local Signing" (created once, never rotated).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "zhida: not macOS. This pack has no stable signature, so Accessibility TCC will not stick."
  npm run build
  npm run build:electron
  npx electron-builder --mac --publish never --config.mac.identity=null
  exit $?
fi

export ZHIDA_IDENTITY_LINES="$(security find-identity -v -p codesigning || true)"
RESOLVED="$(node packaging/printIdentity.cjs)"
CREATE="$(printf '%s\n' "$RESOLVED" | head -n 1)"
IDENTITY="$(printf '%s\n' "$RESOLVED" | tail -n +2 | head -n 1)"

if [[ "$CREATE" == "1" ]]; then
  bash packaging/make_local_signing.sh
fi

echo "zhida: signing with stable identity: ${IDENTITY}"
export CSC_NAME="$IDENTITY"
export ZHIDA_SIGN_IDENTITY="$IDENTITY"

npm run build
npm run build:electron
npx electron-builder --mac --publish never

fail=0
found=0
while IFS= read -r app; do
  found=1
  info="$(codesign -dv "$app" 2>&1 || true)"
  printf '%s\n' "$info" | head -n 12
  if ! grep -q "Identifier=app.zhida.assistant" <<<"$info"; then
    echo "zhida: expected Identifier=app.zhida.assistant on $app" >&2
    fail=1
  fi
  if grep -q "Signature=adhoc" <<<"$info"; then
    echo "zhida: refusing ad-hoc signature on $app. TCC will not stay granted." >&2
    fail=1
  fi
done < <(find release -name '*.app' -type d -maxdepth 4)

if [[ "$found" == "0" ]]; then
  echo "zhida: no .app under release/" >&2
  exit 1
fi
exit "$fail"
