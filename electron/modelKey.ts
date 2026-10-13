import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

function keyFile() {
  return path.join(app.getPath('userData'), 'model-key.bin')
}

/** System encryption when the OS provides it. Otherwise a 0600 file outside the renderer. */
export async function readModelKey() {
  try {
    const bytes = await readFile(keyFile())
    if (bytes.length === 0) return ''
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(bytes)
    return bytes.toString('utf8')
  } catch {
    return ''
  }
}

export async function writeModelKey(value: string) {
  const text = value.trim()
  const file = keyFile()
  if (!text) {
    await rm(file, { force: true })
    return
  }
  await mkdir(path.dirname(file), { recursive: true })
  const bytes = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  await writeFile(file, bytes, { mode: 0o600 })
}
