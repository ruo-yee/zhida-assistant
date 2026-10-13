import { shell } from 'electron'
import { release } from 'node:os'
import { privacyUrlAttempts, type PrivacyPane } from '../src/dock/privacyLinks.ts'

export async function openPrivacyPane(kind: PrivacyPane) {
  if (process.platform !== 'darwin') return false
  const darwinMajor = Number(release().split('.')[0] || 0)
  const urls = privacyUrlAttempts(kind, Number.isFinite(darwinMajor) ? darwinMajor : 0)
  for (const url of urls) {
    try {
      await shell.openExternal(url)
      return true
    } catch {
      continue
    }
  }
  return false
}
