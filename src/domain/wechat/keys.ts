const HEX64 = /^[0-9a-fA-F]{64}$/
const HEX32 = /^[0-9a-fA-F]{32}$/

export function isPrivateMode(mode: number) {
  return (mode & 0o077) === 0
}

function entryKey(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as { enc_key?: unknown; key?: unknown }
    value = record.enc_key ?? record.key
  }
  if (typeof value === 'string' && HEX64.test(value)) return value.toLowerCase()
  return null
}

export function parseManifest(data: unknown): Record<string, string> {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'keys' in data) {
    data = (data as { keys: unknown }).keys
  }
  const items: Array<[unknown, unknown]> = []
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    items.push(...Object.entries(data as Record<string, unknown>))
  } else if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const record = item as { path?: unknown; name?: unknown; salt?: unknown }
      const name = record.path || record.name || record.salt
      if (name) items.push([name, item])
    }
  } else {
    throw new Error('key manifest must be an object or a list')
  }
  const entries: Record<string, string> = {}
  for (const [name, value] of items) {
    const key = entryKey(value)
    if (!key) continue
    let normalized = String(name).replaceAll('\\', '/')
    if (!normalized.startsWith('/')) {
      while (normalized.startsWith('./')) normalized = normalized.slice(2)
    }
    entries[normalized] = key
  }
  return entries
}

export function keyFor(
  entries: Record<string, string>,
  dbPath: string,
  salt?: string | null,
): string {
  const target = dbPath.replaceAll('\\', '/')
  const found = new Set<string>()
  for (const [name, key] of Object.entries(entries)) {
    if (name.startsWith('/')) {
      if (name === target) found.add(key)
    } else if (HEX32.test(name)) {
      if (salt && name.toLowerCase() === salt.toLowerCase()) found.add(key)
    } else if (target.endsWith(`/${name}`)) {
      found.add(key)
    }
  }
  if (found.size !== 1) throw new Error('missing or ambiguous key for this database')
  return [...found][0] ?? ''
}
