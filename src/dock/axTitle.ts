import { stripCountSuffix } from '../domain/wechat/matchChat.ts'
import { realChatTitle } from './sessionReport.ts'

/** Header of the open conversation. Exact identifier, same as the reference reader. */
export const HEADER_TITLE_IDENTIFIER = 'big_title_line_h_view'

const APP_NAMES = new Set(['微信', 'WeChat', 'Weixin'])
const LIST_ROLES = new Set(['AXOutline', 'AXTable', 'AXList'])
const ROW_ROLES = new Set(['AXRow', 'AXOutlineRow'])
const TEXT_ATTRS = ['AXTitle', 'AXDescription', 'AXValue'] as const
const HEADER_MAX_DEPTH = 8
const HEADER_MAX_NODES = 120

export type AxRead = (element: unknown, attribute: string) => unknown

export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

/** Quartz and AX frames match within a few points, as the reference does. */
export function framesNear(a: Frame | null, b: Frame | null, tolerance = 4) {
  if (!a || !b) return false
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  )
}

/**
 * Keep a member-count suffix such as ` (322)` so the session can be 群聊.
 * The reference strips it for its own matcher; this app needs the raw string.
 */
function usableListTitle(value: string) {
  const raw = value.replace(/\s+/g, ' ').trim()
  const stripped = stripCountSuffix(raw).replace(/\s+/g, ' ').trim()
  if (!stripped || APP_NAMES.has(stripped)) return ''
  if (/^\d{1,5}$/.test(stripped) || /^\d{1,2}:\d{2}$/.test(stripped)) return ''
  return raw
}

function textOf(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function childList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function elementTexts(element: unknown, read: AxRead) {
  const texts: string[] = []
  for (const name of TEXT_ATTRS) {
    const value = textOf(read(element, name)).trim()
    if (value) texts.push(value)
  }
  return texts
}

function rowVisibleTitle(row: unknown, read: AxRead) {
  const texts = elementTexts(row, read)
  const walk = (element: unknown, depth: number) => {
    if (depth > 3) return
    const children = childList(read(element, 'AXChildren'))
    for (const child of children) {
      const role = textOf(read(child, 'AXRole'))
      if (role === 'AXStaticText' || role === 'AXTextField' || role === 'AXButton' || role === 'AXCell' || role === '') {
        texts.push(...elementTexts(child, read))
      }
      walk(child, depth + 1)
    }
  }
  walk(row, 0)
  for (const raw of texts) {
    const cleaned = usableListTitle(raw)
    if (cleaned) return cleaned
  }
  return ''
}

/**
 * `(nodeFound, title)` for the header static text.
 * Identifier must equal `big_title_line_h_view` and the role must be AXStaticText.
 * AXValue wins; AXTitle is used only when the value is empty.
 */
export function headerTitleSearch(window: unknown, read: AxRead): { found: boolean; title: string } {
  if (window == null || !read) return { found: false, title: '' }
  const queue: Array<{ element: unknown; depth: number }> = [{ element: window, depth: 0 }]
  let seen = 0
  while (queue.length > 0 && seen < HEADER_MAX_NODES) {
    const item = queue.shift()
    if (!item || item.element == null) continue
    seen += 1
    const identifier = textOf(read(item.element, 'AXIdentifier')).trim()
    const role = textOf(read(item.element, 'AXRole')).trim()
    if (identifier === HEADER_TITLE_IDENTIFIER && role === 'AXStaticText') {
      let raw = textOf(read(item.element, 'AXValue')).trim()
      if (!raw) raw = textOf(read(item.element, 'AXTitle')).trim()
      raw = raw.replace(/\s+/g, ' ').trim()
      const stripped = stripCountSuffix(raw).replace(/\s+/g, ' ').trim()
      if (!stripped || APP_NAMES.has(stripped)) return { found: true, title: '' }
      return { found: true, title: raw }
    }
    if (item.depth >= HEADER_MAX_DEPTH) continue
    for (const child of childList(read(item.element, 'AXChildren'))) {
      queue.push({ element: child, depth: item.depth + 1 })
    }
  }
  return { found: false, title: '' }
}

export function selectedRowTitleFrom(window: unknown, read: AxRead) {
  if (window == null || !read) return ''
  const outlineTitles: string[] = []
  const otherTitles: string[] = []
  let seen = 0

  const consider = (row: unknown, into: string[]) => {
    const title = rowVisibleTitle(row, read)
    if (title) into.push(title)
  }

  const walk = (element: unknown, depth: number) => {
    if (element == null || depth > HEADER_MAX_DEPTH || seen > HEADER_MAX_NODES || outlineTitles.length > 0) return
    seen += 1
    const role = textOf(read(element, 'AXRole'))
    const rows = read(element, 'AXSelectedRows')
    const selected = read(element, 'AXSelected')
    const children = read(element, 'AXChildren')
    if (LIST_ROLES.has(role) && Array.isArray(rows)) {
      const bucket = role === 'AXOutline' ? outlineTitles : otherTitles
      for (const row of rows) {
        consider(row, bucket)
        if (outlineTitles.length > 0) return
      }
    }
    if ((selected === true || selected === 1) && ROW_ROLES.has(role)) {
      consider(element, role === 'AXOutlineRow' ? outlineTitles : otherTitles)
      if (outlineTitles.length > 0) return
    }
    if (Array.isArray(children)) {
      for (const child of children) {
        walk(child, depth + 1)
        if (outlineTitles.length > 0) return
      }
    }
  }

  walk(window, 0)
  if (outlineTitles.length > 0) return outlineTitles[0] ?? ''
  return otherTitles[0] ?? ''
}

/**
 * Match the on-screen chat frame, then the first candidate.
 * Same order as the reference `_chat_ax_window`: a minimized first window
 * is not replaced by a later one unless its frame is the chat.
 */
export function pickChatElement<T>(
  candidates: T[],
  target: Frame | null,
  frameOf: (item: T) => Frame | null,
  minimized: (item: T) => boolean,
): T | null {
  if (target) {
    for (const item of candidates) {
      if (minimized(item)) continue
      if (framesNear(frameOf(item), target)) return item
    }
  }
  const first = candidates[0]
  if (first == null || minimized(first)) return null
  return first
}

/** Window title when it names a chat, otherwise the header, otherwise the selected row. */
export function chatTitleFrom(windowTitle: string, element: unknown, read: AxRead) {
  const named = realChatTitle(windowTitle)
  if (named) return named
  const header = realChatTitle(headerTitleSearch(element, read).title)
  if (header) return header
  return realChatTitle(selectedRowTitleFrom(element, read))
}
