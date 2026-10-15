import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { darwinWeChatWindowScript } from '../src/dock/darwinWindowScript.ts'
import { noteWeChatSight } from '../src/dock/dockedSight.ts'
import { listedWindowOutcome, parseWeChatSnapshot } from '../src/dock/wechatWindow.ts'
import { dockWhenWindowLookupFails } from '../src/dock/hostTrust.ts'
import { parseBoundsReport, parseWeChatPresence } from '../src/dock/parse.ts'
import { applyHideMemory, resolveWeChatVisibility, type HideMemory } from '../src/dock/wechatVisibility.ts'
import type { FindOutcome } from '../src/dock/types.ts'
import { electronAccessibilityTrusted } from './accessibility.ts'
import { DARWIN_APPLESCRIPT, WIN32_POWERSHELL } from './hostScripts.ts'
import { runCommand } from './runCommand.ts'
import { readOnScreenSnapshot } from './wechat/macNative.ts'
import { wechatProcessAlive } from './wechat/processAlive.ts'

let hideMemory: HideMemory = { seenUnhidden: false }

export async function findWeChatWindow(platform = process.platform): Promise<FindOutcome> {
  const found =
    platform === 'darwin' ? await findDarwin() : platform === 'win32' ? await findWin32() : { bounds: null, reason: 'unsupported-platform' as const }
  noteWeChatSight(found)
  return found
}

async function findDarwin(): Promise<FindOutcome> {
  // Reference dock: on-screen CGWindowList in this process, never Accessibility.
  // osascript is only the fallback when that list is blind (a different TCC client).
  let fromList: FindOutcome | null = null
  let listedStderr = ''
  let appHidden = false
  const native = readOnScreenSnapshot(process.pid)
  if (native) {
    appHidden = native.appHidden
    const picked = judgeHide(appHidden, listedWindowOutcome(native))
    if (picked.bounds || picked.reason === 'hidden' || picked.reason === 'not-running') return picked
    fromList = picked
  } else {
    const listed = await runCommand(
      'osascript',
      ['-l', 'JavaScript', '-e', darwinWeChatWindowScript(), '--', String(process.pid), '0'],
      4000,
    )
    listedStderr = listed.stderr
    const snapshot = parseWeChatSnapshot(listed.stdout)
    if (snapshot) {
      appHidden = snapshot.appHidden
      const picked = judgeHide(appHidden, listedWindowOutcome(snapshot))
      if (picked.bounds || picked.reason === 'hidden') return picked
      fromList = picked
    }
  }

  const hostTrusted = electronAccessibilityTrusted()
  const ax = await runCommand('osascript', ['-e', DARWIN_APPLESCRIPT], 4000)
  const presence = parseWeChatPresence(`${ax.stdout}\n${ax.stderr}`)
  const blob = `${listedStderr}\n${ax.stderr}`
  return judgeHide(
    appHidden,
    resolveWeChatVisibility({
      fromList,
      presence,
      hostTrusted,
      fallback: dockWhenWindowLookupFails({
        hostTrusted,
        wechatRunning: await wechatProcessAlive(),
        commandMissing: /ENOENT/i.test(blob),
      }),
    }),
  )
}

function judgeHide(appHidden: boolean, outcome: FindOutcome): FindOutcome {
  const next = applyHideMemory(hideMemory, appHidden, outcome)
  hideMemory = next.memory
  return next.outcome
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
