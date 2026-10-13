import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { isPrivateMode, keyFor, parseManifest } from '../../src/domain/wechat/keys.ts'

export function appSupportDir(home: string, platform: string) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'zhida-assistant')
  if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'zhida-assistant')
  return path.join(home, '.config', 'zhida-assistant')
}

export function wechatDataBases(home: string, platform: string) {
  if (platform === 'darwin') {
    return [
      path.join(home, 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files'),
      path.join(home, 'Desktop/xwechat_files'),
    ]
  }
  if (platform === 'win32') {
    return [path.join(home, 'Documents/xwechat_files'), path.join(home, 'Documents/WeChat Files')]
  }
  return []
}

export function keyFileCandidates(options: {
  home: string
  platform: string
  envFile?: string
  searchDirs?: string
  configuredFile?: string
}) {
  const support = appSupportDir(options.home, options.platform)
  const found = [
    options.envFile,
    options.configuredFile,
    path.join(options.home, '.config', 'zhida-assistant', 'keys.json'),
    path.join(support, 'keys.json'),
  ].filter((item): item is string => Boolean(item))
  for (const base of (options.searchDirs || '').split(path.delimiter).filter(Boolean)) {
    found.push(path.join(base, 'keys.json'))
  }
  return [...new Set(found)]
}

export async function readLocalConfig(file: string) {
  try {
    const info = await stat(file)
    if (!isPrivateMode(info.mode)) return { keyFile: '', dbRoot: '', error: '配置文件权限过宽，请改为仅本人可读。' }
    const raw = JSON.parse(await readFile(file, 'utf8')) as { key_file?: unknown; wechat_db_root?: unknown }
    return {
      keyFile: typeof raw.key_file === 'string' ? raw.key_file : '',
      dbRoot: typeof raw.wechat_db_root === 'string' ? raw.wechat_db_root : '',
      error: '',
    }
  } catch {
    return { keyFile: '', dbRoot: '', error: '' }
  }
}

export async function loadPrivateManifest(file: string) {
  const info = await stat(file)
  if (!isPrivateMode(info.mode)) throw new Error('密钥文件权限过宽，请改为仅本人可读。')
  const entries = parseManifest(JSON.parse(await readFile(file, 'utf8')))
  if (Object.keys(entries).length === 0) throw new Error('密钥清单里没有可用的条目。')
  return entries
}

export async function findAccountRoot(bases: string[], preferred = '') {
  if (preferred) {
    const normalized = await normalizeRoot(preferred)
    if (normalized) return normalized
  }
  for (const base of bases) {
    let names: string[] = []
    try {
      names = await readdir(base)
    } catch {
      continue
    }
    const roots: string[] = []
    for (const name of names) {
      const candidate = path.join(base, name, 'db_storage')
      if (await looksLikeRoot(candidate)) roots.push(candidate)
    }
    if (roots.length === 1) return roots[0]
  }
  return ''
}

async function normalizeRoot(value: string) {
  const direct = value.endsWith(`${path.sep}db_storage`) || value.endsWith('/db_storage') ? value : path.join(value, 'db_storage')
  if (await looksLikeRoot(direct)) return direct
  if (await looksLikeRoot(value)) return value
  return ''
}

async function looksLikeRoot(root: string) {
  try {
    const contact = await stat(path.join(root, 'contact', 'contact.db'))
    const message = await stat(path.join(root, 'message'))
    return contact.isFile() && message.isDirectory()
  } catch {
    return false
  }
}

export async function messageDbNames(root: string) {
  const dir = path.join(root, 'message')
  const names = await readdir(dir)
  return names.filter((name) => /^message_\d+\.db$/.test(name)).sort()
}

export async function fileSalt(file: string) {
  const handle = await readFile(file)
  return handle.subarray(0, 16).toString('hex')
}

export function accountIdFromRoot(root: string) {
  const name = path.basename(path.dirname(root))
  const match = /^(wxid_[A-Za-z0-9_-]+)_[0-9a-f]{4}$/.exec(name)
  return match?.[1] || name
}

export function lookupKey(entries: Record<string, string>, file: string, salt: string) {
  return keyFor(entries, file, salt)
}
