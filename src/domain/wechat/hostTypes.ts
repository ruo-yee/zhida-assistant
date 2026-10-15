import type { WeChatSession } from './WeChatBridge.ts'

export interface HostActionResult {
  ok: boolean
  handled: boolean
  reason: string
}

export interface HostBridgeStatus {
  platform: string
  available: boolean
  axTrusted: boolean
  wechatRunning: boolean
  dbReady: boolean
  needsAccessibility: boolean
  /** Packaged app is 智答助手; `npm run dev` shows up as Electron. */
  accessibilityName?: string
  detail: string
  session: WeChatSession | null
}
