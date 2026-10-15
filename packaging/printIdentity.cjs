const { resolveMacIdentity, parseIdentityLines } = require('./resolveIdentity.cjs')

const result = resolveMacIdentity({
  cscName: process.env.CSC_NAME || '',
  identities: parseIdentityLines(process.env.ZHIDA_IDENTITY_LINES || ''),
})
process.stdout.write(`${result.createLocal ? '1' : '0'}\n${result.identity}\n`)
