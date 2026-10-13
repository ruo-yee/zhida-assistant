import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { darwinWeChatWindowScript } from '../src/dock/darwinWindowScript.ts'
import { listedWindowOutcome, parseWeChatSnapshot } from '../src/dock/wechatWindow.ts'
import { dockWhenWindowLookupFails } from '../src/dock/hostTrust.ts'
import { parseBoundsReport, parseWeChatPresence } from '../src/dock/parse.ts'
import { resolveWeChatVisibility } from '../src/dock/wechatVisibility.ts'
import type { FindOutcome } from '../src/dock/types.ts'
import { electronAccessibilityTrusted } from './accessibility.ts'
import { DARWIN_APPLESCRIPT, WIN32_POWERSHELL } from './hostScripts.ts'
import { runCommand } from './runCommand.ts'
import { wechatProcessAlive } from './wechat/processAlive.ts'

export async function findWeChatWindow(platform = process.platform): Promise<FindOutcome> {
  if (platform === 'darwin') return findDarwin()
  if (platform === 'win32') return findWin32()
  return { bounds: null, reason: 'unsupported-platform' }
}

async function findDarwin(): Promise<FindOutcome> {
  const listed = await runCommand(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      darwinWeChatWindowScript(),
      '--',
      String(process.pid),
      electronAccessibilityTrusted() ? '1' : '0',
    ],
    4000,
  )
  const snapshot = parseWeChatSnapshot(listed.stdout)
  let fromList: FindOutcome | null = null
  if (snapshot) {
    const picked = listedWindowOutcome(snapshot)
    // On-screen bounds dock immediately. Minimized, Cmd+H, or off-screen
    // WeChat is hidden here, before a stale System Events frame can dock.
    if (picked.bounds) return picked
    if (picked.reason === 'hidden') return picked
    fromList = picked
  }

  const hostTrusted = electronAccessibilityTrusted()
  const ax = await runCommand('osascript', ['-e', DARWIN_APPLESCRIPT], 4000)
  const presence = parseWeChatPresence(`${ax.stdout}\n${ax.stderr}`)
  const blob = `${listed.stderr}\n${ax.stderr}`
  return resolveWeChatVisibility({
    fromList,
    presence,
    hostTrusted,
    fallback: dockWhenWindowLookupFails({
      hostTrusted,
      wechatRunning: await wechatProcessAlive(),
      commandMissing: /ENOENT/i.test(blob),
    }),
  })
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
