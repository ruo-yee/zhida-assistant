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

/**
 * Pick WeChat's largest on-screen layer-0 window.
 * Identity comes from the bundle PID (NSWorkspace), then the owner name.
 * A blank title — common without Screen Recording — still matches.
 */
export function selectWeChatWindow(snapshot: WeChatWindowSnapshot): FindOutcome {
  if (snapshot.error && snapshot.pids.length === 0 && snapshot.windows.length === 0) {
    return { bounds: null, reason: 'error' }
  }
  const pids = new Set(snapshot.pids)
  const owners = new Set<string>(WECHAT_OWNER_NAMES)
  const candidates = snapshot.windows.filter((win) => isDockable(win) && isWeChatWindow(win, pids, owners))
  candidates.sort((a, b) => b.width * b.height - a.width * a.height || b.id - a.id)
  const best = candidates[0]
  if (best) {
    return {
      bounds: electronBoundsFromQuartz({
        x: best.x,
        y: best.y,
        width: best.width,
        height: best.height,
        title: best.title || best.owner || snapshot.names[0] || '微信',
      }),
      reason: 'ok',
    }
  }
  if (
    snapshot.axBounds &&
    snapshot.axBounds.width >= MIN_DOCK_WINDOW &&
    snapshot.axBounds.height >= MIN_DOCK_WINDOW
  ) {
    return {
      bounds: electronBoundsFromQuartz({
        x: snapshot.axBounds.x,
        y: snapshot.axBounds.y,
        width: snapshot.axBounds.width,
        height: snapshot.axBounds.height,
        title: snapshot.names[0] || '微信',
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
