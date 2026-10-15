import type { FindOutcome, HostWindow } from './types.ts'
import { dockOutcomeWithAx } from './axDock.ts'

export interface HideMemory {
  /** WeChat was on screen while the main app was not hidden. Cmd+H can then be trusted. */
  seenUnhidden: boolean
}

/**
 * A stuck isHidden flag must not undock a window we have never seen unhidden.
 * After a real visible spell, Cmd+H hides the companion even if the window
 * server still lists the frame.
 */
export function applyHideMemory(memory: HideMemory, appHidden: boolean, outcome: FindOutcome): {
  memory: HideMemory
  outcome: FindOutcome
} {
  const seenUnhidden = memory.seenUnhidden || Boolean(outcome.bounds && !appHidden)
  if (appHidden && seenUnhidden) {
    return { memory: { seenUnhidden }, outcome: { bounds: null, reason: 'hidden' } }
  }
  return { memory: { seenUnhidden }, outcome }
}

export interface WeChatPresenceReport {
  presence: 'visible' | 'hidden' | 'absent'
  bounds: HostWindow | null
}

/**
 * An on-screen CoreGraphics window wins. Otherwise a hidden or minimized
 * WeChat stays hidden, even when System Events can still describe its frame.
 * A visible frame still docks when the window list is blind.
 */
export function resolveWeChatVisibility(input: {
  fromList: FindOutcome | null
  presence: WeChatPresenceReport
  hostTrusted: boolean
  fallback: FindOutcome
}): FindOutcome {
  if (input.fromList?.reason === 'ok' && input.fromList.bounds) return input.fromList
  // The on-screen list saw other windows, but not WeChat: it is minimized or
  // on another space. Do not dock the frame System Events still reports.
  if (input.fromList?.reason === 'hidden') return { bounds: null, reason: 'hidden' }
  if (input.presence.presence === 'hidden') return { bounds: null, reason: 'hidden' }
  const resolved = dockOutcomeWithAx(input.fromList, input.presence.bounds, input.hostTrusted)
  if (resolved?.reason === 'ok') return resolved
  if (resolved) return resolved
  return input.fallback
}
