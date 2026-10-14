import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { LOCAL_IDENTITY, parseIdentityLines, resolveMacIdentity } = require('../../packaging/resolveIdentity.cjs')
const { signArguments } = require('../../scripts/macStableSign.cjs')

describe('stable mac signing identity', () => {
  it('prefers CSC_NAME, then Apple Development, and does not rotate a local certificate', () => {
    const apple = 'Apple Development: 6445016@qq.com (R62G2LP3VX)'
    expect(resolveMacIdentity({ cscName: apple, identities: [LOCAL_IDENTITY] })).toEqual({
      identity: apple,
      source: 'CSC_NAME',
      createLocal: false,
    })
    expect(resolveMacIdentity({ identities: [apple, LOCAL_IDENTITY] })).toMatchObject({
      identity: apple,
      source: 'apple-development',
      createLocal: false,
    })
    expect(resolveMacIdentity({ identities: [LOCAL_IDENTITY] })).toMatchObject({
      source: 'local',
      createLocal: false,
    })
    expect(resolveMacIdentity({ identities: [] })).toEqual({
      identity: LOCAL_IDENTITY,
      source: 'create-local',
      createLocal: true,
    })
    expect(resolveMacIdentity({ cscName: '-' })).toMatchObject({ createLocal: true })
    expect(parseIdentityLines(`  1) DEADBEEF "${apple}"`)).toEqual([apple])
  })

  it('does not configure ad-hoc signing', () => {
    const yml = readFileSync('electron-builder.yml', 'utf8')
    expect(yml).not.toContain('identity: null')
    expect(yml).not.toContain('identity: "-"')
    expect(yml).toContain('afterSign: scripts/macStableSign.cjs')
    const hook = readFileSync('scripts/macStableSign.cjs', 'utf8')
    expect(hook).toContain('ZHIDA_SIGN_IDENTITY')
    expect(hook).toContain('Signature=adhoc')
    expect(hook).not.toContain("'--sign', '-'")
    expect(hook).toContain('entitlements.mac.plist')
    expect(hook).not.toContain("'--options', 'runtime'")
    expect(yml).toContain('hardenedRuntime: false')
    const entitlements = readFileSync('build/entitlements.mac.plist', 'utf8')
    expect(entitlements).toContain('com.apple.security.cs.allow-jit')
    expect(entitlements).toContain('com.apple.security.cs.allow-unsigned-executable-memory')
    expect(entitlements).toContain('com.apple.security.cs.disable-library-validation')
    const build = readFileSync('packaging/build_mac.sh', 'utf8')
    expect(build).toContain('CSC_NAME')
    expect(build).toContain('make_local_signing.sh')
    const local = readFileSync('packaging/make_local_signing.sh', 'utf8')
    expect(local).toContain('Zhida Assistant Local Signing')
    expect(local).toContain('will not be rotated')
  })

  it('passes the bundle path to codesign', () => {
    const app = '/tmp/智答助手.app'
    const args = signArguments(app, 'Zhida Assistant Local Signing')
    expect(args.slice(0, 3)).toEqual(['--force', '--sign', 'Zhida Assistant Local Signing'])
    expect(args.at(-1)).toBe(app)
    expect(args.some((arg: string) => arg.endsWith('build/entitlements.mac.plist'))).toBe(true)
    expect(args).not.toContain('--options')
    expect(args).not.toContain('runtime')
  })
})
