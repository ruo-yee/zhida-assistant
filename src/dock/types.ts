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

export type DockReason = 'ok' | 'not-running' | 'permission' | 'unsupported-platform' | 'error'

export type DockMode = 'searching' | 'docked' | 'floating'

export interface FindOutcome {
  bounds: HostWindow | null
  reason: DockReason
}

export interface DockPlacement extends Rect {
  side: DockSide
}

export interface DockStatus {
  mode: DockMode
  platform: string
  detail: string
  side?: DockSide
}
