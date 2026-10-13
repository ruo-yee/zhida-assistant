#!/usr/bin/env bash
# Stable local code-signing identity, same idea as WeChat JEV's
# "WeChat JEV Local Signing": one certificate, reused on every rebuild,
# so Accessibility TCC keeps matching isTrustedAccessibilityClient.
# Ad-hoc "-" changes the code hash every build and the trust check stays false.
set -euo pipefail

IDENTITY="${ZHIDA_LOCAL_IDENTITY:-Zhida Assistant Local Signing}"
KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
if [[ ! -f "$KEYCHAIN" ]]; then
  KEYCHAIN="${HOME}/Library/Keychains/login.keychain"
fi

if security find-identity -v -p codesigning | grep -F "\"${IDENTITY}\"" >/dev/null; then
  echo "zhida: local identity already exists and will not be rotated: ${IDENTITY}"
  security find-identity -v -p codesigning | grep -F "${IDENTITY}" || true
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/codesign.cnf" <<EOF
[ req ]
distinguished_name = req_distinguished_name
x509_extensions = codesign_ext
prompt = no
[ req_distinguished_name ]
CN = ${IDENTITY}
[ codesign_ext ]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/codesign.cnf"

openssl pkcs12 -export \
  -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$TMP/identity.p12" -passout pass:zhida-local

security import "$TMP/identity.p12" \
  -k "$KEYCHAIN" -P zhida-local -f pkcs12 -A \
  -T /usr/bin/codesign -T /usr/bin/security

security add-trusted-cert -d -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem" || \
  echo "zhida: could not mark the cert trusted automatically. In Keychain Access, set ${IDENTITY} to Always Trust for code signing."

if [[ -n "${KEYCHAIN_PASSWORD:-}" ]]; then
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
else
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$KEYCHAIN" || \
    echo "zhida: if codesign asks for the login keychain, re-run with KEYCHAIN_PASSWORD set."
fi

if ! security find-identity -v -p codesigning | grep -F "\"${IDENTITY}\"" >/dev/null; then
  echo "zhida: ${IDENTITY} was imported but is not a codesigning identity yet." >&2
  exit 1
fi

echo "zhida: created ${IDENTITY}"
