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

/** Letter-spaced Latin such as `b u l a j i` is one name. Same rule as the reference normalizer. */
const SPACED_LATIN = /^(?:[A-Za-z0-9_-]\s+){2,}[A-Za-z0-9_-]$/

export function normalizeChatTitle(value: string) {
  let text = value.replace(/\s+/g, ' ').trim()
  if (SPACED_LATIN.test(text)) text = text.replace(/ /g, '')
  else text = text.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/gu, '')
  return text.trim()
}

export function realChatTitle(value: string) {
  const raw = normalizeChatTitle(value)
  const stripped = stripCountSuffix(raw)
  if (!stripped || !usableTitle(raw) || AUXILIARY.has(stripped) || BARE_COUNT.test(stripped) || CLOCK.test(stripped)) {
    return ''
  }
  return raw
}

export interface PlacedText {
  x: number
  y: number
  text: string
}

export interface VisibleChatReport {
  title: string
  lines: string[]
  /** Screen bounds of the same window, when System Events reported them. */
  bounds?: { x: number; y: number; width: number; height: number } | null
  /** Static texts with positions, so the title band can be chosen like OCR. */
  placed?: PlacedText[]
}

/** System Events `TITLE` / `LINE` rows. `HIDDEN` means the app is up but not on screen. */
export function parseVisibleChatReport(stdout: string): VisibleChatReport | 'hidden' | null {
  const rows = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (rows.length === 0) return null
  if (rows.every((line) => line.toUpperCase() === 'HIDDEN')) return 'hidden'
  let title = ''
  const lines: string[] = []
  const placed: PlacedText[] = []
  let bounds: VisibleChatReport['bounds'] = null
  for (const row of rows) {
    if (row.startsWith('TITLE\t') || row.startsWith('TITLE ')) {
      title = row.slice(6).trim()
      continue
    }
    if (row.startsWith('BOUNDS\t') || row.startsWith('BOUNDS ')) {
      const parts = row.slice(7).split('\t').map((part) => Number(part))
      if (parts.length >= 4 && parts.every((part) => Number.isFinite(part)) && parts[2] > 0 && parts[3] > 0) {
        bounds = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
      }
      continue
    }
    if (row.startsWith('POS\t') || row.startsWith('POS ')) {
      const parts = row.slice(4).split('\t')
      const y = Number(parts[0])
      const x = Number(parts[1])
      const text = parts.slice(2).join('\t').trim()
      if (text && Number.isFinite(x) && Number.isFinite(y)) placed.push({ x, y, text })
      continue
    }
    if (row.startsWith('LINE\t') || row.startsWith('LINE ')) {
      const text = row.slice(5).trim()
      if (text) lines.push(text)
    }
  }
  if (!title && lines.length === 0 && placed.length === 0) return null
  return { title, lines, bounds, placed }
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
  if (header) return header.trim()
  // A private chat has no member count. System Events still returns the
  // header as a short Latin name such as bulaji. Message lines are not names.
  for (const line of lines) {
    const title = latinChatName(line)
    if (title) return title
  }
  return ''
}

function latinChatName(value: string) {
  const title = realChatTitle(value)
  if (!title) return ''
  const bare = stripCountSuffix(title)
  return /^[A-Za-z0-9_-]{3,32}$/.test(bare) ? title : ''
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
  const named = usableTitle(report.title) ? report.title.trim() : ''
  const band = named ? '' : pickPositionedTitle(report.bounds ?? null, report.placed ?? [])
  const listed = named || band || pickVisibleTitle('', report.lines)
  const title = resolveChatTitle({ windowTitle: view.title, visibleWindowTitle: listed }) || view.title
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
  x: number
  height: number
  text: string
}

/**
 * Texts of the top-most text row. Same rule as the reference `title_row`:
 * a pinned notice under the title is not part of the name.
 */
export function titleRowTexts(observations: OcrObservation[]) {
  const items = observations.filter((item) => item.text.trim())
  if (items.length === 0) return []
  const first = items.reduce((best, item) => (item.y < best.y ? item : best))
  const height = first.height > 0 ? first.height : 0
  const rowBottom = first.y + height
  const row = items.filter((item) => {
    if (height <= 0) return Math.abs(item.y - first.y) <= 1e-4
    const itemHeight = item.height > 0 ? item.height : height
    return item.y + itemHeight / 2 <= rowBottom
  })
  row.sort((a, b) => a.x - b.x)
  return row.map((item) => item.text.trim())
}

/**
 * Header inside the conversation title band. Same crop as OCR, using
 * System Events positions when the accessibility window list is empty.
 */
export function pickPositionedTitle(
  bounds: { x: number; y: number; width: number; height: number } | null,
  placed: PlacedText[],
) {
  if (!bounds || placed.length === 0) return ''
  const crop = conversationCrop(bounds)
  const inBand = placed.filter(
    (item) =>
      item.x >= crop.x - 4 &&
      item.x <= crop.x + crop.width + 4 &&
      item.y >= crop.y - 4 &&
      item.y <= crop.y + crop.height + 8,
  )
  if (inBand.length === 0) return ''
  return pickOcrTitle(titleRowTexts(inBand.map((item) => ({ y: item.y, x: item.x, height: 18, text: item.text }))))
}

/** Title from the top text row only. Lower lines stay available as messages. */
export function pickOcrChat(observations: OcrObservation[]) {
  const sorted = observations.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y)
  const texts = sorted.map((item) => item.text)
  const title = pickOcrTitle(titleRowTexts(sorted))
  return { title, lines: pickVisibleLines(texts, title) }
}

export function parseOcrObservations(stdout: string): OcrObservation[] {
  const out: OcrObservation[] = []
  for (const row of stdout.split(/\r?\n/)) {
    if (!row.startsWith('LINE\t')) continue
    const parts = row.slice(5).split('\t')
    if (parts.length < 2) continue
    const y = Number(parts[0])
    if (!Number.isFinite(y)) continue
    if (parts.length >= 4) {
      const x = Number(parts[1])
      const height = Number(parts[2])
      const text = parts.slice(3).join('\t').trim()
      if (!text) continue
      out.push({ y, x: Number.isFinite(x) ? x : 0, height: Number.isFinite(height) ? height : 0, text })
      continue
    }
    const text = parts.slice(1).join('\t').trim()
    if (!text) continue
    out.push({ y, x: 0, height: 0, text })
  }
  return out
}

/**
 * Title band of a docked WeChat window, top-left origin, points.
 * Same geometry as the reference `title_crop_for` with `fallback_pane_left`:
 * icon rail 68, chat list 280, 36pt bias, 96pt right margin, 4pt from the top, 72pt tall.
 */
export function conversationCrop(bounds: { x: number; y: number; width: number; height: number }) {
  const windowWidth = bounds.width
  const windowHeight = bounds.height
  if (windowWidth <= 1 || windowHeight <= 1) {
    return {
      x: Math.round(bounds.x + windowWidth * 0.3),
      y: Math.round(bounds.y + windowHeight * 0.018),
      width: Math.max(1, Math.round(windowWidth * 0.62)),
      height: Math.max(1, Math.round(windowHeight * 0.1)),
    }
  }
  const paneLeft = Math.min(68 + 280, Math.max(windowWidth - 180, 0))
  let left = paneLeft - 36
  left = Math.min(Math.max(left, 68), Math.max(windowWidth - 80, 0))
  let right = windowWidth - 96
  if (right < left + 80) right = Math.min(windowWidth, left + 80)
  const top = Math.min(4, Math.max(windowHeight - 1, 0))
  const height = Math.max(Math.min(72, windowHeight - top), 1)
  return {
    x: Math.round(bounds.x + left),
    y: Math.round(bounds.y + top),
    width: Math.round(right - left),
    height: Math.round(height),
  }
}
