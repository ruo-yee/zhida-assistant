import type { FindOutcome, HostWindow } from './types.ts'

/** Main WeChat bundle. Helpers that own the real window use the second id. */
export const WECHAT_BUNDLE_IDS = ['com.tencent.xinWeChat', 'com.tencent.xinWeChat.WeChatAppEx', 'com.tencent.flue.WeChatAppEx'] as const

/**
 * Exact owner names only. Substring checks also match 微信读书 and 微信输入法.
 * WeChat 4.x reports 微信, WeChat, Weixin, or the WeChatAppEx helper.
 */
export const WECHAT_OWNER_NAMES = ['微信', 'WeChat', 'Weixin', 'WeChatAppEx'] as const

export const MIN_DOCK_WINDOW = 240

export interface ListedWindow {
  pid: number
  layer: number
  x: number
  y: number
  width: number
  height: number
  title: string
  owner: string
  id: number
}

export interface WeChatWindowSnapshot {
  pids: number[]
  names: string[]
  selfPid: number
  windows: ListedWindow[]
  /** null when Accessibility was not asked (a CG hit already existed). */
  axTrusted: boolean | null
  axBounds: { x: number; y: number; width: number; height: number } | null
  /** Main WeChat app is hidden with Cmd+H. Helpers alone do not set this. */
  appHidden: boolean
  /**
   * Cmd+H, a window that exists only off-screen, or AX windows that are all
   * minimized. Both CoreGraphics lists being empty is not concealed: WeChat 4
   * often omits itself there while System Events can still dock.
   */
  concealed: boolean
  error?: string
}

/**
 * CGWindowList and Electron `setBounds` both use a top-left origin in points
 * (Y grows downward). AppKit's bottom-left origin is a different space.
 */
export function electronBoundsFromQuartz(bounds: HostWindow): HostWindow {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    title: bounds.title,
  }
}

/** Convert an AppKit frame (origin at the window's bottom-left) into Electron's top-left space. */
export function electronBoundsFromAppKit(bounds: HostWindow, primaryHeight: number): HostWindow {
  return {
    x: bounds.x,
    y: primaryHeight - bounds.y - bounds.height,
    width: bounds.width,
    height: bounds.height,
    title: bounds.title,
  }
}

function finite(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function parseWeChatSnapshot(stdout: string): WeChatWindowSnapshot | null {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .find((item) => item.startsWith('{'))
  if (!line) return null
  try {
    const raw = JSON.parse(line) as {
      pids?: unknown
      names?: unknown
      selfPid?: unknown
      windows?: unknown
      axTrusted?: unknown
      axBounds?: unknown
      appHidden?: unknown
      concealed?: unknown
      error?: unknown
    }
    const windows = Array.isArray(raw.windows) ? raw.windows : []
    const ax = raw.axBounds
    const axRecord = ax && typeof ax === 'object' ? (ax as Record<string, unknown>) : null
    const axBounds = axRecord
      ? {
          x: finite(axRecord.x),
          y: finite(axRecord.y),
          width: finite(axRecord.width),
          height: finite(axRecord.height),
        }
      : null
    return {
      pids: Array.isArray(raw.pids) ? raw.pids.map((pid) => finite(pid)).filter((pid) => pid > 0) : [],
      names: Array.isArray(raw.names) ? raw.names.map((name) => String(name || '')).filter(Boolean) : [],
      selfPid: finite(raw.selfPid),
      windows: windows.map((item) => {
        const win = item as Record<string, unknown>
        return {
          pid: finite(win.pid),
          layer: finite(win.layer),
          x: finite(win.x),
          y: finite(win.y),
          width: finite(win.width),
          height: finite(win.height),
          title: String(win.title || ''),
          owner: String(win.owner || ''),
          id: finite(win.id),
        }
      }),
      axTrusted: raw.axTrusted === null || raw.axTrusted === undefined ? null : Boolean(raw.axTrusted),
      axBounds: axBounds && axBounds.width > 0 && axBounds.height > 0 ? axBounds : null,
      appHidden: Boolean(raw.appHidden),
      concealed: Boolean(raw.concealed),
      error: raw.error ? String(raw.error) : undefined,
    }
  } catch {
    return null
  }
}

function isWeChatWindow(win: ListedWindow, pids: Set<number>, owners: Set<string>) {
  return pids.has(win.pid) || owners.has(win.owner)
}

function isDockable(win: ListedWindow) {
  return win.layer === 0 && win.width >= MIN_DOCK_WINDOW && win.height >= MIN_DOCK_WINDOW
}

const EMOJI_MARKERS = ['表情', 'emoji', 'sticker', '贴纸', '颜文字']

function emojiWindowTitle(title: string) {
  const folded = title.trim().toLowerCase()
  if (!folded) return false
  return EMOJI_MARKERS.some((marker) => folded.includes(marker.toLowerCase()))
}

function auxiliaryWindowTitle(title: string) {
  const text = title.trim().toLowerCase()
  return text === '用 ai 处理' || text === '用ai处理' || text === '图片预览' || text === 'preview'
}

/**
 * Main chat window. Emoji pickers and media chrome are never chosen.
 * A window much smaller than the largest is a popover.
 * Same rules as the reference `choose_chat_window`.
 */
export function chooseChatWindow(windows: ListedWindow[]): ListedWindow | null {
  const parsed = windows.filter((win) => win.width >= 80 && win.height >= 80)
  const pool = parsed.filter((win) => !emojiWindowTitle(win.title) && !auxiliaryWindowTitle(win.title))
  if (pool.length === 0) return null
  const largest = Math.max(...pool.map((win) => win.width * win.height))
  const tallest = Math.max(...pool.map((win) => win.height))
  let main = pool.filter((win) => {
    const area = win.width * win.height
    if (area < largest * 0.72) return false
    if (win.height + 120 < tallest && area < largest * 0.9) return false
    return true
  })
  if (main.length === 0) main = pool
  main.sort((a, b) => b.width * b.height - a.width * a.height || b.id - a.id)
  return main[0] ?? null
}

/**
 * On-screen windows win. When that list has no dockable WeChat window,
 * keep a layer-0 window from the full list (option 0). WeChat 4 can be
 * visible while `kCGWindowListOptionOnScreenOnly` omits it.
 */
export function mergeChatWindows(onScreen: ListedWindow[], allWindows: ListedWindow[], pids: number[]): ListedWindow[] {
  const pidSet = new Set(pids)
  const owners = new Set<string>(WECHAT_OWNER_NAMES)
  const visible = onScreen.some((win) => isDockable(win) && isWeChatWindow(win, pidSet, owners))
  if (visible) return onScreen
  const seen = new Set(onScreen.map((win) => win.id))
  const extra = allWindows.filter((win) => {
    if (seen.has(win.id)) return false
    return isDockable(win) && isWeChatWindow(win, pidSet, owners)
  })
  return extra.length > 0 ? [...onScreen, ...extra] : onScreen
}

/**
 * Pick the on-screen main chat window.
 * Identity comes from the bundle PID, then the owner name.
 * A blank title — common without Screen Recording — still matches.
 * Accessibility frames are not a dock source.
 */
export function selectWeChatWindow(snapshot: WeChatWindowSnapshot): FindOutcome {
  if (snapshot.error && snapshot.pids.length === 0 && snapshot.windows.length === 0) {
    return { bounds: null, reason: 'error' }
  }
  const pids = new Set(snapshot.pids)
  const owners = new Set<string>(WECHAT_OWNER_NAMES)
  const wechat = snapshot.windows.filter((win) => win.layer === 0 && isWeChatWindow(win, pids, owners))
  const chosen = chooseChatWindow(wechat)
  if (chosen && isDockable(chosen)) {
    return {
      bounds: electronBoundsFromQuartz({
        x: chosen.x,
        y: chosen.y,
        width: chosen.width,
        height: chosen.height,
        title: chosen.title || chosen.owner || snapshot.names[0] || '微信',
      }),
      reason: 'ok',
    }
  }
  const wechatRunning = pids.size > 0 || snapshot.windows.some((win) => owners.has(win.owner))
  if (!wechatRunning) return { bounds: null, reason: 'not-running' }
  const ownedAny = snapshot.windows.some((win) => isWeChatWindow(win, pids, owners))
  const others = snapshot.windows.some(
    (win) => isDockable(win) && win.pid !== snapshot.selfPid && !isWeChatWindow(win, pids, owners),
  )
  if (!ownedAny && !others) {
    return {
      bounds: null,
      reason: 'screen-recording',
      needsAccessibility: snapshot.axTrusted === false,
    }
  }
  if (snapshot.axTrusted === false && !ownedAny) {
    return { bounds: null, reason: 'permission', needsAccessibility: true }
  }
  return { bounds: null, reason: 'hidden' }
}

function hasOnScreenWeChat(snapshot: WeChatWindowSnapshot) {
  const pids = new Set(snapshot.pids)
  const owners = new Set<string>(WECHAT_OWNER_NAMES)
  return snapshot.windows.some((win) => isDockable(win) && isWeChatWindow(win, pids, owners))
}

/**
 * An on-screen chat window docks immediately. Cmd+H hides even if a stale
 * frame is still attached. A CoreGraphics miss (empty list, or only this
 * app) is left for System Events. Other apps on screen and no WeChat
 * window means minimized or hidden.
 */
export function listedWindowOutcome(snapshot: WeChatWindowSnapshot): FindOutcome {
  const picked = selectWeChatWindow(snapshot)
  if (picked.bounds && hasOnScreenWeChat(snapshot)) return picked
  if (snapshot.appHidden || snapshot.concealed) return { bounds: null, reason: 'hidden' }
  return picked
}
