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
 * Browser demo: `MockWeChatBridge` owns an in-memory session.
 *
 * Future Mac adapter, not shipped here:
 * - `getActiveSession` reads the frontmost chat title through Accessibility.
 * - History, if needed, comes from a read-only local database handle.
 *   Do not write, migrate, or ship key material for that database.
 * - `insertText` writes the composer through the UI.
 * - `sendText` is off unless the chat is on an allow-list the user turned on.
 * - The assistant window stays beside the chat window; it does not replace it.
 */
export interface WeChatBridge {
  getActiveSession(): Promise<WeChatSession>
  insertText(text: string): Promise<void>
  sendText(text: string): Promise<void>
}
