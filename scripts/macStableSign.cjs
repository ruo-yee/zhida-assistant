const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const BUNDLE_ID = 'app.zhida.assistant'

/**
 * After electron-builder signs, refuse an ad-hoc or Electron identifier.
 * A stable identity (Apple Development or "Zhida Assistant Local Signing")
 * is what lets Accessibility TCC match isTrustedAccessibilityClient.
 */
module.exports = async function macStableSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (spawnSync('codesign', ['-h']).error) {
    console.warn('[zhida] codesign is not on PATH, cannot verify the mac signature')
    return
  }
  const product = context.packager.appInfo.productFilename
  const candidates = [
    path.join(context.appOutDir, `${product}.app`),
    path.join(context.appOutDir, 'zhida-assistant.app'),
    path.join(context.appOutDir, '智答助手.app'),
  ]
  const appPath = candidates.find((item) => fs.existsSync(item))
  if (!appPath) throw new Error(`[zhida] could not find the .app in ${context.appOutDir}`)

  let info = codesignInfo(appPath)
  if (accepted(info)) {
    console.log(`[zhida] ${appPath} Identifier=${BUNDLE_ID}`)
    return
  }
  const identity = (process.env.ZHIDA_SIGN_IDENTITY || process.env.CSC_NAME || '').trim()
  if (!identity || identity === '-') {
    throw new Error(
      `[zhida] signature is not stable (${summarize(info)}). Refusing ad-hoc "-". Run packaging/build_mac.sh or set CSC_NAME.`,
    )
  }
  resign(appPath, identity)
  info = codesignInfo(appPath)
  if (!accepted(info)) {
    throw new Error(`[zhida] after signing with ${identity}: ${summarize(info)}`)
  }
  console.log(`[zhida] signed ${appPath} with ${identity}`)
}

function accepted(info) {
  return identifierOf(info) === BUNDLE_ID && !/Signature=adhoc/.test(info)
}

function summarize(info) {
  const id = identifierOf(info) || 'missing'
  const adhoc = /Signature=adhoc/.test(info) ? ' adhoc' : ''
  return `Identifier=${id}${adhoc}`
}

function identifierOf(info) {
  return /Identifier=(\S+)/.exec(info)?.[1] ?? ''
}

function codesignInfo(target) {
  const result = spawnSync('codesign', ['-dv', target], { encoding: 'utf8' })
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

function signArguments(target, identity) {
  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist')
  const args = ['--force', '--sign', identity]
  if (fs.existsSync(entitlements)) args.push('--entitlements', entitlements)
  // Do not pass --options runtime. Hardened Runtime without the Electron JIT
  // entitlements crashes on launch; electron-builder.yml leaves it off.
  // The bundle path is the last argument. Without it codesign exits before signing.
  args.push(target)
  return args
}

function sign(target, identity) {
  execFileSync('codesign', signArguments(target, identity), { stdio: 'inherit' })
}

module.exports.signArguments = signArguments

function resign(appPath, identity) {
  const bundles = []
  collectBundles(appPath, bundles)
  for (const bundle of bundles) {
    if (bundle !== appPath) sign(bundle, identity)
  }
  const macOs = path.join(appPath, 'Contents', 'MacOS')
  if (fs.existsSync(macOs)) {
    for (const name of fs.readdirSync(macOs)) {
      if (!name.startsWith('.')) sign(path.join(macOs, name), identity)
    }
  }
  sign(appPath, identity)
}

function collectBundles(dir, acc) {
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const full = path.join(dir, name)
    let stat
    try {
      stat = fs.lstatSync(full)
    } catch {
      continue
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue
    collectBundles(full, acc)
    if (name.endsWith('.app') || name.endsWith('.framework') || name.endsWith('.xpc')) acc.push(full)
  }
}
