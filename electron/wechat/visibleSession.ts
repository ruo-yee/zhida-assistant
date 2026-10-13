import { usableTitle } from '../../src/domain/wechat/matchChat.ts'
import { parseWeChatPresence } from '../../src/dock/parse.ts'
import { mergeVisibleSession, parseVisibleChatReport, pickVisibleTitle, type VisibleChatReport } from '../../src/dock/sessionReport.ts'
import { DARWIN_APPLESCRIPT, DARWIN_VISIBLE_SCRIPT } from '../hostScripts.ts'
import { runCommand } from '../runCommand.ts'
import type { AxView } from './axDriver.ts'

/**
 * Docking already sees this window through System Events. Read that same
 * window even when Accessibility reports no AXWindows. The title comes from
 * the fast script; visible lines are best-effort and must not drop the title.
 */
export async function readVisibleChat(): Promise<VisibleChatReport | null> {
  const quick = await runCommand('osascript', ['-e', DARWIN_APPLESCRIPT], 2500)
  const presence = parseWeChatPresence(`${quick.stdout}\n${quick.stderr}`)
  if (presence.presence === 'hidden' || !presence.bounds) return null
  const quickTitle = presence.bounds.title === '微信' ? '' : presence.bounds.title
  const rich = await runCommand('osascript', ['-e', DARWIN_VISIBLE_SCRIPT], 2000)
  const report = parseVisibleChatReport(`${rich.stdout}\n${rich.stderr}`)
  if (report && report !== 'hidden') {
    const title = pickVisibleTitle(quickTitle, []) || pickVisibleTitle(report.title, report.lines) || report.title
    return { title, lines: report.lines }
  }
  if (!usableTitle(quickTitle)) return { title: '', lines: [] }
  return { title: quickTitle, lines: [] }
}

export function applyVisibleChat(view: AxView, report: VisibleChatReport | null): AxView {
  const merged = mergeVisibleSession(view, report)
  if (!merged.hasWindow) return view
  const cleared = view.reason === 'no-window' || !view.hasWindow
  return { ...view, ...merged, reason: cleared ? '' : view.reason }
}
