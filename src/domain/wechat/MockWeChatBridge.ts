import { formatClock, uid } from '../../lib/sleep.ts'
import type { WeChatBridge, WeChatSession } from './WeChatBridge.ts'
import { createSeedSession } from './seed.ts'

export interface DraftEcho {
  id: string
  text: string
}

type Listener = () => void

/**
 * In-browser stand-in for the host chat app.
 * Companion code should depend on `WeChatBridge`; the extra methods exist
 * so the demo pane can type, receive a customer line, and reset.
 */
export class MockWeChatBridge implements WeChatBridge {
  private session: WeChatSession
  private echo: DraftEcho | null = null
  private lastSentId: string | null = null
  private listeners = new Set<Listener>()

  constructor(session: WeChatSession = createSeedSession()) {
    this.session = session
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot() {
    return this.session
  }

  getDraftEcho() {
    return this.echo
  }

  getLastSentId() {
    return this.lastSentId
  }

  async getActiveSession(): Promise<WeChatSession> {
    return structuredClone(this.session)
  }

  async insertText(text: string) {
    this.session = { ...this.session, composerText: text }
    this.echo = { id: uid('echo'), text }
    this.emit()
  }

  async sendText(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const message = { id: uid('m'), role: 'agent' as const, text: trimmed }
    this.session = {
      ...this.session,
      composerText: '',
      messages: [...this.session.messages, message],
    }
    this.echo = null
    this.lastSentId = message.id
    this.emit()
  }

  setComposerText(text: string) {
    this.session = { ...this.session, composerText: text }
    if (!this.echo) {
      this.emit()
      return
    }
    this.echo = text.trim() ? { ...this.echo, text } : null
    this.emit()
  }

  appendCustomer(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const time = formatClock()
    const previous = [...this.session.messages].reverse().find((message) => message.timeLabel)?.timeLabel
    this.session = {
      ...this.session,
      messages: [
        ...this.session.messages,
        {
          id: uid('m'),
          role: 'customer',
          text: trimmed,
          timeLabel: time === previous ? undefined : time,
        },
      ],
    }
    this.emit()
  }

  reset(session: WeChatSession = createSeedSession()) {
    this.session = session
    this.echo = null
    this.lastSentId = null
    this.emit()
  }

  private emit() {
    for (const listener of this.listeners) listener()
  }
}
