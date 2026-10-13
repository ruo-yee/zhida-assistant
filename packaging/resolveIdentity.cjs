/** Stable name for the optional local certificate. Do not rotate it once TCC has been granted. */
const LOCAL_IDENTITY = 'Zhida Assistant Local Signing'

/**
 * Pick one signing identity and keep using it.
 * CSC_NAME wins. Otherwise the first Apple Development cert on this Mac,
 * then an existing local certificate. A missing local certificate is created
 * once by make_local_signing.sh and reused after that.
 */
function resolveMacIdentity({ cscName = '', identities = [], localName = LOCAL_IDENTITY } = {}) {
  const explicit = String(cscName || '').trim()
  if (explicit && explicit !== '-') {
    return { identity: explicit, source: 'CSC_NAME', createLocal: false }
  }
  const apple = identities.find((id) => id.startsWith('Apple Development:'))
  if (apple) return { identity: apple, source: 'apple-development', createLocal: false }
  if (identities.includes(localName)) return { identity: localName, source: 'local', createLocal: false }
  return { identity: localName, source: 'create-local', createLocal: true }
}

function parseIdentityLines(text) {
  const names = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/"([^"]+)"/)
    if (match) names.push(match[1])
  }
  return names
}

module.exports = { LOCAL_IDENTITY, resolveMacIdentity, parseIdentityLines }
