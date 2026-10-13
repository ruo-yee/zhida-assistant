export interface WeChatMessage {
  id: string
  role: 'customer' | 'agent'
  text: string
  timeLabel?: string
}

export interface WeChatSession {
  id: string
  peerName: string
  presence: 'online' | 'offline'
  chatType: 'private' | 'group'
  composerText: string
  messages: WeChatMessage[]
}

/**
 * Host chat bridge.
 *
 * The browser demo uses `MockWeChatBridge`. The desktop shell adds a Mac
 * adapter behind `window.zhida.wechat`: Accessibility reads the current
 * chat and writes the composer, and a read-only SQLCipher handle can supply
 * history when a private keys file is present. `sendText` runs only after
 * the user clicks 一键发送. Nothing in the poll loop sends.
 */
export interface WeChatBridge {
  getActiveSession(): Promise<WeChatSession>
  insertText(text: string): Promise<void>
  sendText(text: string): Promise<void>
}
