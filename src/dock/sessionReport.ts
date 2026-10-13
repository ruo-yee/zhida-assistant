import { stripCountSuffix, usableTitle } from '../domain/wechat/matchChat.ts'

const CHROME = new Set(['微信', 'WeChat', 'Weixin', '搜索', '聊天', '通讯录', '发现'])
const AUXILIARY = new Set(['用 AI 处理', '用AI处理', '图片预览', 'Preview'])
const GROUP_TITLE = /[(（]\s*\d{1,5}\s*[)）]?\s*$/u
const BARE_COUNT = /^\d{1,5}$/
const CLOCK = /^\d{1,2}:\d{2}$/

export interface ChatTitleParts {
  windowTitle?: string
  headerTitle?: string
  selectedTitle?: string
  visibleWindowTitle?: string
  ocrTitle?: string
}

/**
 * Chat name, keeping a member-count suffix such as ` (322)` so the session
 * can be marked 群聊. App-only names, clocks, and bare counts are skipped.
 * Order: AX window title, exact header, selected list row, System Events
 * window name, then OCR. OCR runs only after the earlier sources are empty.
 */
export function resolveChatTitle(parts: ChatTitleParts) {
  const ordered = [parts.windowTitle, parts.headerTitle, parts.selectedTitle, parts.visibleWindowTitle, parts.ocrTitle]
  for (const candidate of ordered) {
    const title = realChatTitle(candidate ?? '')
    if (title) return title
  }
  return ''
}

export function realChatTitle(value: string) {
  const raw = value.replace(/\s+/g, ' ').trim()
  const stripped = stripCountSuffix(raw)
  if (!stripped || !usableTitle(raw) || AUXILIARY.has(stripped) || BARE_COUNT.test(stripped) || CLOCK.test(stripped)) {
    return ''
  }
  return raw
}

export interface VisibleChatReport {
  title: string
  lines: string[]
}

/** System Events `TITLE` / `LINE` rows. `HIDDEN` means the app is up but not on screen. */
export function parseVisibleChatReport(stdout: string): VisibleChatReport | 'hidden' | null {
  const rows = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (rows.length === 0) return null
  if (rows.every((line) => line.toUpperCase() === 'HIDDEN')) return 'hidden'
  let title = ''
  const lines: string[] = []
  for (const row of rows) {
    if (row.startsWith('TITLE\t') || row.startsWith('TITLE ')) {
      title = row.slice(6).trim()
      continue
    }
    if (row.startsWith('LINE\t') || row.startsWith('LINE ')) {
      const text = row.slice(5).trim()
      if (text) lines.push(text)
    }
  }
  if (!title && lines.length === 0) return null
  return { title, lines }
}

/**
 * Prefer the real window name (`迈腾7连-3班 (322)`). A generic "微信" title
 * falls through to a short group header in the visible texts.
 */
export function pickVisibleTitle(windowTitle: string, lines: string[]) {
  const named = windowTitle.trim()
  if (usableTitle(named)) return named
  const header = lines.find((line) => {
    const text = line.trim()
    return text.length <= 40 && GROUP_TITLE.test(text) && !CHROME.has(text)
  })
  return header?.trim() ?? ''
}

export function pickVisibleLines(lines: string[], title: string) {
  const skip = new Set([title.trim(), usableTitle(title)].filter(Boolean))
  const out: string[] = []
  for (const raw of lines) {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (text.length < 2 || text.length > 180) continue
    if (text === 'missing value' || CHROME.has(text) || text.includes('条新消息')) continue
    if (skip.has(text) || skip.has(usableTitle(text))) continue
    if (GROUP_TITLE.test(text) && text.length <= 40) continue
    if (out.includes(text)) continue
    out.push(text)
  }
  return out.slice(-12)
}

export function mergeVisibleSession<T extends { hasWindow: boolean; title: string; transcript: string[] }>(
  view: T,
  report: VisibleChatReport | null,
): T {
  if (!report) return view
  const title =
    resolveChatTitle({ windowTitle: view.title, visibleWindowTitle: report.title }) ||
    pickVisibleTitle('', report.lines) ||
    view.title
  const transcript = view.transcript.length > 0 ? view.transcript : pickVisibleLines(report.lines, title)
  // A report only exists when System Events sees an on-screen window.
  return { ...view, hasWindow: true, title, transcript }
}

/** First real chat name. A member-count suffix wins, so a group header beats a later line. */
export function pickOcrTitle(lines: string[]) {
  let fallback = ''
  for (const line of lines) {
    const title = realChatTitle(line)
    if (!title) continue
    if (GROUP_TITLE.test(title)) return title
    if (!fallback) fallback = title
  }
  return fallback
}

export interface OcrObservation {
  y: number
  text: string
}

/** Header band first, then the rest of the capture. Y grows downward, 0–1. */
export function pickOcrChat(observations: OcrObservation[]) {
  const sorted = observations.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y)
  const header = sorted.filter((item) => item.y <= 0.16).map((item) => item.text)
  const texts = sorted.map((item) => item.text)
  const title = pickOcrTitle(header) || pickOcrTitle(texts)
  return { title, lines: pickVisibleLines(texts, title) }
}

export function parseOcrObservations(stdout: string): OcrObservation[] {
  const out: OcrObservation[] = []
  for (const row of stdout.split(/\r?\n/)) {
    if (!row.startsWith('LINE\t')) continue
    const rest = row.slice(5)
    const tab = rest.indexOf('\t')
    if (tab < 0) continue
    const y = Number(rest.slice(0, tab))
    const text = rest.slice(tab + 1).trim()
    if (!text || !Number.isFinite(y)) continue
    out.push({ y, text })
  }
  return out
}

/** Conversation pane of a docked WeChat window, top-left origin, points. */
export function conversationCrop(bounds: { x: number; y: number; width: number; height: number }) {
  const left = Math.min(312, Math.max(bounds.width - 200, 0))
  const width = Math.max(120, bounds.width - left - 24)
  const height = Math.max(80, Math.min(bounds.height - 8, Math.round(bounds.height * 0.72)))
  return {
    x: Math.round(bounds.x + left),
    y: Math.round(bounds.y + 2),
    width: Math.round(Math.min(width, bounds.width - left)),
    height: Math.round(height),
  }
}
