export const NEED_AX = '插入需要辅助功能权限。请到「系统设置 → 隐私与安全性 → 辅助功能」允许智答助手。'
export const SEND_DEDUPE_MS = 3000

const BREAKS = new Set(['\r', '\n', '\t', '\u0085', '\u2028', '\u2029'])

export function cleanText(text: string) {
  let out = ''
  for (const char of text) {
    if (BREAKS.has(char)) {
      out += ' '
      continue
    }
    const code = char.codePointAt(0) ?? 0
    if (code < 32 || (code >= 0x7f && code <= 0x9f)) continue
    out += char
  }
  return out.replace(/ +/g, ' ').trim()
}

export interface ComposerView {
  trusted: boolean
  running: boolean
  hasWindow: boolean
  hasTextArea: boolean
  composer: string | null
}

export type ComposerPlan =
  | { action: 'refuse'; reason: string }
  | { action: 'set'; text: string }
  | { action: 'return'; text: string }

export function planInsert(view: ComposerView, raw: string): ComposerPlan {
  const text = cleanText(raw)
  if (!text) return { action: 'refuse', reason: '没有可插入的内容' }
  if (!view.trusted) return { action: 'refuse', reason: NEED_AX }
  if (!view.running) return { action: 'refuse', reason: '微信没有运行' }
  if (!view.hasWindow) return { action: 'refuse', reason: '没找到微信主窗口（微信可能已最小化或隐藏）' }
  if (!view.hasTextArea) return { action: 'refuse', reason: '微信没有提供可写入的输入框，请用复制' }
  if (view.composer === null) return { action: 'refuse', reason: '输入框文字不可读取' }
  if (view.composer.trim()) return { action: 'refuse', reason: '输入框已有草稿，未覆盖' }
  return { action: 'set', text }
}

export function confirmInserted(composer: string | null, text: string, sameChat: boolean): ComposerPlan {
  if (composer?.trim() !== text) return { action: 'refuse', reason: '写入后校验失败' }
  if (!sameChat) return { action: 'refuse', reason: '当前微信会话已变化，已撤回插入，未发送' }
  return { action: 'set', text }
}

export function planSend(view: ComposerView, raw: string): ComposerPlan {
  const text = cleanText(raw)
  if (!text) return { action: 'refuse', reason: '没有可发送的内容' }
  if (!view.trusted) return { action: 'refuse', reason: NEED_AX }
  if (!view.running) return { action: 'refuse', reason: '微信没有运行' }
  if (!view.hasWindow) return { action: 'refuse', reason: '没找到微信主窗口（微信可能已最小化或隐藏）' }
  const current = view.composer?.trim() ?? ''
  if (current === text) return { action: 'return', text }
  if (current) return { action: 'refuse', reason: '输入框已有草稿，未发送' }
  return planInsert(view, text)
}

interface Stamp {
  at: number
  inflight: boolean
}

export class SendGuard {
  private stamps = new Map<string, Stamp>()

  claim(kind: 'insert' | 'return', windowId: string, text: string, now: number) {
    const key = `${kind}\n${windowId}\n${text}`
    const current = this.stamps.get(key)
    if (current?.inflight) {
      return {
        ok: false,
        reason: kind === 'return' ? '相同内容正在发送，未重复操作' : '相同内容正在插入，未重复操作',
      }
    }
    if (current && now - current.at < SEND_DEDUPE_MS) {
      return {
        ok: false,
        reason: kind === 'return' ? '刚刚已发送过相同内容，未重复发送' : '刚刚已插入过相同内容，未重复插入',
      }
    }
    this.stamps.set(key, { at: current?.at ?? 0, inflight: true })
    return { ok: true, reason: '' }
  }

  finish(kind: 'insert' | 'return', windowId: string, text: string, sent: boolean, now: number) {
    const key = `${kind}\n${windowId}\n${text}`
    const current = this.stamps.get(key)
    this.stamps.set(key, { at: sent ? now : (current?.at ?? 0), inflight: false })
  }
}
