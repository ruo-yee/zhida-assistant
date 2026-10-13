import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isAssistivePermissionError, parseBoundsReport } from '../src/dock/parse.ts'
import type { FindOutcome } from '../src/dock/types.ts'
import { DARWIN_APPLESCRIPT, DARWIN_CGWINDOW_SCRIPT, WIN32_POWERSHELL } from './hostScripts.ts'
import { runCommand } from './runCommand.ts'

export async function findWeChatWindow(platform = process.platform): Promise<FindOutcome> {
  if (platform === 'darwin') return findDarwin()
  if (platform === 'win32') return findWin32()
  return { bounds: null, reason: 'unsupported-platform' }
}

async function findDarwin(): Promise<FindOutcome> {
  const cg = await runCommand('osascript', ['-l', 'JavaScript', '-e', DARWIN_CGWINDOW_SCRIPT])
  const fromCg = parseBoundsReport(cg.stdout)
  if (fromCg) return { bounds: fromCg, reason: 'ok' }

  const ax = await runCommand('osascript', ['-e', DARWIN_APPLESCRIPT])
  const fromAx = parseBoundsReport(ax.stdout)
  if (fromAx) return { bounds: fromAx, reason: 'ok' }

  if (isAssistivePermissionError(`${cg.stderr}\n${ax.stderr}`)) return { bounds: null, reason: 'permission' }
  if (/ENOENT/i.test(`${cg.stderr} ${ax.stderr}`)) return { bounds: null, reason: 'error' }
  return { bounds: null, reason: 'not-running' }
}

async function findWin32(): Promise<FindOutcome> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zhida-'))
  const file = path.join(dir, 'find-wechat.ps1')
  try {
    await writeFile(file, WIN32_POWERSHELL, 'utf8')
    const result = await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', file])
    const bounds = parseBoundsReport(result.stdout)
    if (bounds) return { bounds, reason: 'ok' }
    if (/ENOENT/i.test(result.stderr)) return { bounds: null, reason: 'error' }
    if (result.code && result.code !== 0) return { bounds: null, reason: 'error' }
    return { bounds: null, reason: 'not-running' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
