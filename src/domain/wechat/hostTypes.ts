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
  detail: string
  session: WeChatSession | null
}
