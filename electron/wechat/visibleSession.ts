import { adoptDockedWindow, dockedWeChat } from '../../src/dock/dockedSight.ts'
import { usableTitle } from '../../src/domain/wechat/matchChat.ts'
import { parseWeChatPresence } from '../../src/dock/parse.ts'
import {
  mergeVisibleSession,
  parseVisibleChatReport,
  pickVisibleTitle,
  resolveChatTitle,
  type VisibleChatReport,
} from '../../src/dock/sessionReport.ts'
import { electronAccessibilityTrusted } from '../accessibility.ts'
import { DARWIN_APPLESCRIPT, DARWIN_ONSCREEN_SCRIPT, DARWIN_VISIBLE_SCRIPT } from '../hostScripts.ts'
import { runCommand } from '../runCommand.ts'
import type { AxView } from './axDriver.ts'
import { readAxChatTitle } from './macNative.ts'
import { readOcrChat } from './titleOcr.ts'
import { wechatProcessAlive } from './processAlive.ts'

/**
 * Read the window the dock is using. When that poll already sees WeChat,
 * do not apply a second hidden/minimized verdict that can drop the chat.
 */
export async function readVisibleChat(onScreen = false): Promise<VisibleChatReport | null> {
  if (onScreen) {
    const rich = await runCommand('osascript', ['-e', DARWIN_ONSCREEN_SCRIPT], 3500)
    const report = parseVisibleChatReport(rich.stdout)
    if (!report || report === 'hidden') return null
    const title = pickVisibleTitle(report.title, report.lines) || (report.title === '微信' ? '' : report.title)
    return { title, lines: report.lines }
  }
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

function blankAx(trusted: boolean, running: boolean): AxView {
  return {
    trusted,
    running,
    hasWindow: false,
    windowId: '',
    title: '',
    hasTextArea: false,
    composer: null,
    transcript: [],
    reason: trusted && running ? 'no-window' : '',
  }
}

/**
 * Session poll. Title order matches the reference: AX window title, header
 * `big_title_line_h_view`, selected row, then the docked window name, then OCR.
 * A window the dock is already beside is never "no window".
 * This does not call osascript Accessibility; that stalled the dock tick.
 */
export async function readDesktopSession(): Promise<AxView> {
  const trusted = electronAccessibilityTrusted()
  const running = await wechatProcessAlive()
  const blank = blankAx(trusted, running)
  if (process.platform !== 'darwin' || !trusted || !running) return blank
  const docked = dockedWeChat()
  let native: ReturnType<typeof readAxChatTitle> = null
  try {
    const frame = docked?.bounds
    native = readAxChatTitle(frame ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height } : null, trusted)
  } catch {
    native = null
  }
  if (docked) {
    let view: AxView = { ...blank, ...adoptDockedWindow(blank, docked.title) }
    if (native?.title) {
      const title = resolveChatTitle({ windowTitle: native.title, visibleWindowTitle: view.title }) || view.title
      view = { ...view, hasWindow: true, title, reason: '' }
    }
    // The name is enough to leave 「正在等微信当前会话」. Visible lines and OCR
    // stay the fallback when the ladder has not named the chat yet.
    if (usableTitle(view.title)) return view
    return fillFromVisibleWindow(view)
  }
  if (native?.state === 'visible') {
    const view: AxView = { ...blank, hasWindow: true, title: native.title, reason: '' }
    if (usableTitle(view.title)) return view
    return fillFromVisibleWindow(view)
  }
  if (native?.state === 'minimized') return { ...blank, hasWindow: false, reason: 'no-window' }
  return fillFromVisibleWindow(blank)
}

/** Insert still needs the text area. The visible session wins for the chat name. */
export function mergeComposerView(visible: AxView, ax: AxView): AxView {
  const hasWindow = visible.hasWindow || ax.hasWindow
  const title = resolveChatTitle({ windowTitle: visible.title, headerTitle: ax.title }) || visible.title || ax.title
  return {
    trusted: visible.trusted || ax.trusted,
    running: visible.running || ax.running,
    hasWindow,
    windowId: ax.windowId || visible.windowId,
    title,
    hasTextArea: ax.hasTextArea,
    composer: ax.composer,
    transcript: ax.transcript.length > 0 ? ax.transcript : visible.transcript,
    reason: hasWindow ? '' : ax.reason || visible.reason,
  }
}

/** Same on-screen window the dock found, then OCR. Not used when the title ladder already named the chat. */
export async function fillFromVisibleWindow(view: AxView): Promise<AxView> {
  if (!view.trusted || !view.running) return view
  const docked = dockedWeChat()
  let next = view
  const complete = view.hasWindow && Boolean(usableTitle(view.title)) && view.transcript.length > 0
  if (!complete) next = applyVisibleChat(view, await readVisibleChat(Boolean(docked)))
  if (!docked) return next
  next = adoptDockedWindow(next, docked.title)
  if (usableTitle(next.title) && next.transcript.length > 0) return next
  const seen = await readOcrChat(docked.bounds)
  const title =
    resolveChatTitle({ windowTitle: next.title, visibleWindowTitle: docked.title, ocrTitle: seen.title }) || next.title
  const transcript = next.transcript.length > 0 ? next.transcript : seen.lines
  const missing = !next.hasWindow || next.reason === 'no-window'
  return { ...next, hasWindow: true, title, transcript, reason: missing ? '' : next.reason }
}
