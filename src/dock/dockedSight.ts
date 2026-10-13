import { resolveChatTitle } from './sessionReport.ts'
import type { FindOutcome, HostWindow } from './types.ts'

const FRESH_MS = 5000

export interface DockedWeChat {
  at: number
  title: string
  bounds: HostWindow
}

let sight: DockedWeChat | null = null

/** Dock poll is the visibility authority. A later session read must not disagree with it. */
export function noteWeChatSight(outcome: FindOutcome, now = Date.now()) {
  if (outcome.reason === 'ok' && outcome.bounds) {
    sight = { at: now, title: outcome.bounds.title || '', bounds: outcome.bounds }
    return
  }
  if (outcome.reason === 'hidden' || outcome.reason === 'not-running') sight = null
}

export function dockedWeChat(now = Date.now()): DockedWeChat | null {
  if (!sight) return null
  if (now - sight.at > FRESH_MS) return null
  return sight
}

export function resetWeChatSight() {
  sight = null
}

/**
 * A window the dock is already beside is the main window.
 * `dockTitle` null means WeChat is not currently on screen.
 */
export function adoptDockedWindow<T extends { hasWindow: boolean; title: string; reason: string }>(
  view: T,
  dockTitle: string | null,
): T {
  if (dockTitle === null) return view
  const title = resolveChatTitle({ windowTitle: view.title, visibleWindowTitle: dockTitle }) || view.title
  const missing = !view.hasWindow || view.reason === 'no-window'
  return { ...view, hasWindow: true, title, reason: missing ? '' : view.reason }
}
