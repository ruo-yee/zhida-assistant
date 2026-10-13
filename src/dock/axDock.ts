import { electronBoundsFromQuartz, MIN_DOCK_WINDOW } from './wechatWindow.ts'
import type { FindOutcome, HostWindow } from './types.ts'

/**
 * CGWindowList is empty without Screen Recording. System Events still returns
 * `x,y,width,height,title` in the same top-left space as Electron, for example
 * `0,111,915,693,微信`. A hit docks immediately and is not a Screen Recording failure.
 */
export function dockOutcomeWithAx(
  fromList: FindOutcome | null,
  ax: HostWindow | null,
  hostTrusted?: boolean,
): FindOutcome | null {
  if (fromList?.reason === 'ok' && fromList.bounds) return fromList
  if (ax && ax.width >= MIN_DOCK_WINDOW && ax.height >= MIN_DOCK_WINDOW) {
    return {
      bounds: electronBoundsFromQuartz({ ...ax, title: ax.title || '微信' }),
      reason: 'ok',
    }
  }
  if (!fromList) return null
  const trusted = hostTrusted ?? fromList.needsAccessibility !== true
  const missed = fromList.reason === 'screen-recording' || fromList.reason === 'permission'
  if (!missed) return fromList
  if (!trusted) return { bounds: null, reason: 'permission', needsAccessibility: true }
  return { bounds: null, reason: 'screen-recording', needsAccessibility: false }
}
