export interface HostWindow {
  x: number
  y: number
  width: number
  height: number
  title: string
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type DockSide = 'right' | 'left'

export type DockReason =
  | 'ok'
  | 'not-running'
  | 'hidden'
  | 'permission'
  | 'screen-recording'
  | 'unsupported-platform'
  | 'error'

export type DockMode = 'searching' | 'docked' | 'floating'

export interface FindOutcome {
  bounds: HostWindow | null
  reason: DockReason
  /** Accessibility can still supply a window when the CG list is blind. */
  needsAccessibility?: boolean
}

export interface DockPlacement extends Rect {
  side: DockSide
}

export interface DockStatus {
  mode: DockMode
  platform: string
  detail: string
  side?: DockSide
  needsAccessibility?: boolean
  needsScreenRecording?: boolean
  /** macOS Accessibility / Screen Recording list name: 智答助手 or Electron. */
  accessibilityName?: string
  /**
   * Packaged build: the trust API is false. The System Settings toggle can stay
   * on after an update because the code hash changed.
   */
  accessibilityStale?: boolean
}
