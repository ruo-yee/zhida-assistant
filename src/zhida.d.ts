import type { DockStatus } from './dock/types.ts'

declare global {
  interface Window {
    zhida?: {
      platform: string
      getDockStatus: () => Promise<DockStatus>
      reattach: () => Promise<DockStatus>
      onDockStatus: (callback: (status: DockStatus) => void) => () => void
    }
  }
}

export {}
