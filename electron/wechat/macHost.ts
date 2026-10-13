import path from 'node:path'
import { homedir } from 'node:os'
import { app } from 'electron'
import type { HostActionResult, HostBridgeStatus } from '../../src/domain/wechat/hostTypes.ts'
import { accessibilityDetail } from '../../src/domain/wechat/accessibilityCopy.ts'
import type { WeChatMessage, WeChatSession } from '../../src/domain/wechat/WeChatBridge.ts'
import {
  NEED_AX,
  SendGuard,
  confirmInserted,
  planInsert,
  planSend,
  type ComposerView,
} from '../../src/domain/wechat/composerPolicy.ts'
import { matchChat, usableTitle } from '../../src/domain/wechat/matchChat.ts'
import {
  decodeMessageText,
  indexChats,
  messageSelect,
  type IndexedChat,
} from '../../src/domain/wechat/messageSql.ts'
import { runAx, type AxView } from './axDriver.ts'
import {
  accountIdFromRoot,
  appSupportDir,
  fileSalt,
  findAccountRoot,
  keyFileCandidates,
  loadPrivateManifest,
  lookupKey,
  messageDbNames,
  readLocalConfig,
  wechatDataBases,
} from './discover.ts'
import { querySqlcipher } from './sqlcipher.ts'

const INDEX_TTL_MS = 30_000
const MESSAGE_LIMIT = 30

export class MacWeChatHost {
  private tail: Promise<unknown> = Promise.resolve()
  private guard = new SendGuard()
  private chats: IndexedChat[] = []
  private locations = new Map<string, string[]>()
  private indexedAt = 0
  private root = ''
  private entries: Record<string, string> | null = null
  private dbDetail = ''

  poll(): Promise<HostBridgeStatus> {
    return this.enqueue(() => this.inspect())
  }

  insertText(text: string): Promise<HostActionResult> {
    return this.enqueue(() => this.insert(text))
  }

  sendText(text: string): Promise<HostActionResult> {
    return this.enqueue(() => this.send(text))
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn)
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private async inspect(): Promise<HostBridgeStatus> {
    const view = await runAx('inspect')
    const base = this.statusFrom(view)
    if (!view.running || !view.trusted || !view.hasWindow) return base
    try {
      const loaded = await this.ensureLibrary()
      if (!loaded.root || !loaded.entries) {
        return { ...base, detail: loaded.detail, session: titleSession(view.title) }
      }
      const chats = await this.conversationIndex(loaded.root, loaded.entries)
      const title = usableTitle(view.title)
      const chat = matchChat(title, chats)
      if (!title) return { ...base, dbReady: true, detail: '已连接微信，但没有读到当前会话标题。' }
      if (!chat) {
        return {
          ...base,
          dbReady: true,
          detail: `已看到会话「${title}」，本地记录里没有唯一对应的联系人。`,
          session: titleSession(title),
        }
      }
      const messages = await this.recentMessages(loaded.root, loaded.entries, chat)
      return {
        ...base,
        dbReady: true,
        available: true,
        detail: `正在跟随微信会话「${chat.chatName}」。`,
        session: {
          id: `wechat:${chat.chatId}`,
          peerName: chat.chatName,
          presence: 'online',
          chatType: chat.group ? 'group' : 'private',
          composerText: view.composer?.trim() ?? '',
          messages,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '读微信记录失败'
      return { ...base, detail: message, session: titleSession(view.title) }
    }
  }

  private async insert(text: string): Promise<HostActionResult> {
    const view = await runAx('inspect')
    const plan = planInsert(toComposer(view), text)
    if (plan.action === 'refuse') return handled(false, refuseReason(plan.reason))
    if (plan.action !== 'set') return handled(false, '没有可插入的内容')
    const claimed = this.guard.claim('insert', view.windowId, plan.text, Date.now())
    if (!claimed.ok) return handled(false, claimed.reason)
    let sent = false
    try {
      const written = await runAx('set', plan.text)
      const confirmed = confirmInserted(written.composer, plan.text, sameTitle(view.title, written.title))
      if (confirmed.action === 'refuse') {
        if (confirmed.reason.includes('会话已变化')) await runAx('clear')
        return handled(false, confirmed.reason)
      }
      sent = true
      return handled(true, '已插入')
    } finally {
      this.guard.finish('insert', view.windowId, plan.text, sent, Date.now())
    }
  }

  private async send(text: string): Promise<HostActionResult> {
    const view = await runAx('inspect')
    const plan = planSend(toComposer(view), text)
    if (plan.action === 'refuse') return handled(false, refuseReason(plan.reason))
    if (plan.action === 'return') return this.pressReturn(view, plan.text)
    const inserted = await this.insert(plan.text)
    if (!inserted.ok) return inserted
    const again = await runAx('inspect')
    if (again.composer?.trim() !== plan.text) return handled(false, '没能核对输入框，未发送')
    if (!sameTitle(view.title, again.title)) {
      await runAx('clear')
      return handled(false, '当前微信会话已变化，已撤回插入，未发送')
    }
    return this.pressReturn(again, plan.text)
  }

  private async pressReturn(view: AxView, text: string): Promise<HostActionResult> {
    const claimed = this.guard.claim('return', view.windowId, text, Date.now())
    if (!claimed.ok) return handled(false, claimed.reason)
    let sent = false
    try {
      const pressed = await runAx('return')
      sent = (pressed.composer ?? '').trim() === ''
      return handled(sent, sent ? '已发送' : '已填入输入框，但未发送（微信的发送键可能不是回车）')
    } finally {
      this.guard.finish('return', view.windowId, text, sent, Date.now())
    }
  }

  private statusFrom(view: AxView): HostBridgeStatus {
    let detail = '正在检查微信…'
    if (!view.trusted) detail = accessibilityDetail(app.isPackaged)
    else if (!view.running) detail = '微信没有运行。打开后会读取当前会话。'
    else if (view.reason === '辅助功能调用失败' || view.reason === '辅助功能接口不存在') detail = '微信在运行，但还读不到窗口。'
    else if (!view.hasWindow || view.reason === 'no-window') detail = '没找到微信主窗口（微信可能已最小化或隐藏）。'
    else detail = usableTitle(view.title) ? `已识别微信会话「${usableTitle(view.title)}」。` : '已连接微信，但没有读到当前会话标题。'
    return {
      platform: 'darwin',
      available: view.running && view.trusted && view.hasWindow,
      axTrusted: view.trusted,
      wechatRunning: view.running,
      dbReady: false,
      needsAccessibility: !view.trusted,
      detail,
      session: null,
    }
  }

  private async ensureLibrary() {
    if (this.entries && this.root) return { root: this.root, entries: this.entries, detail: this.dbDetail }
    const home = homedir()
    const support = appSupportDir(home, 'darwin')
    const config = await readLocalConfig(path.join(support, 'config.json'))
    if (config.error) return { root: '', entries: null, detail: config.error }
    const candidates = keyFileCandidates({
      home,
      platform: 'darwin',
      envFile: process.env.ZHIDA_KEY_FILE,
      searchDirs: process.env.ZHIDA_KEY_SEARCH_DIRS,
      configuredFile: config.keyFile,
    })
    let entries: Record<string, string> | null = null
    let failure = ''
    for (const file of candidates) {
      try {
        entries = await loadPrivateManifest(file)
        break
      } catch (error) {
        failure = error instanceof Error ? error.message : failure
      }
    }
    if (!entries) {
      return {
        root: '',
        entries: null,
        detail: failure || '未找到 keys.json。请放到 ~/.config/zhida-assistant/keys.json，并设为仅本人可读。',
      }
    }
    const root = await findAccountRoot(wechatDataBases(home, 'darwin'), config.dbRoot)
    if (!root) {
      return { root: '', entries, detail: '没有找到唯一的微信账号目录。可在配置里写 wechat_db_root。' }
    }
    this.entries = entries
    this.root = root
    this.dbDetail = ''
    return { root, entries, detail: '' }
  }

  private async conversationIndex(root: string, entries: Record<string, string>) {
    if (this.chats.length && Date.now() - this.indexedAt < INDEX_TTL_MS) return this.chats
    const contact = path.join(root, 'contact', 'contact.db')
    const contacts = (await querySqlcipher(
      contact,
      lookupKey(entries, contact, await fileSalt(contact)),
      'SELECT username,nick_name,remark,is_in_chat_room FROM contact WHERE username IS NOT NULL AND username != ""',
    )).flatMap((row) => (row.username ? [{
      username: row.username,
      nick_name: row.nick_name,
      remark: row.remark,
      is_in_chat_room: row.is_in_chat_room,
    }] : []))
    const names = await messageDbNames(root)
    const tables: string[] = []
    const locations = new Map<string, string[]>()
    for (const name of names) {
      const file = path.join(root, 'message', name)
      const rows = await querySqlcipher(
        file,
        lookupKey(entries, file, await fileSalt(file)),
        "SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'Msg_[0-9a-f][0-9a-f]*'",
      )
      const found = rows.map((row) => row.name).filter((item): item is string => Boolean(item))
      tables.push(...found)
      for (const table of found) {
        const list = locations.get(table) ?? []
        list.push(file)
        locations.set(table, list)
      }
    }
    this.chats = indexChats(contacts, tables)
    this.locations = locations
    this.indexedAt = Date.now()
    return this.chats
  }

  private async recentMessages(root: string, entries: Record<string, string>, chat: IndexedChat) {
    const selfId = accountIdFromRoot(root)
    const table = chat.tables[0]
    if (!table) return []
    const files = this.locations.get(table) ?? []
    const collected: Array<WeChatMessage & { order: number }> = []
    for (const file of files) {
      const rows = await querySqlcipher(
        file,
        lookupKey(entries, file, await fileSalt(file)),
        messageSelect(table, '', 'DESC', MESSAGE_LIMIT),
      )
      for (const row of rows) {
        const sender = row.sender_id || null
        const type = Number(row.local_type || 0)
        const text = decodeMessageText(Buffer.from(row.body || '', 'hex'), type, chat.chatId, sender)
        if (!text || (type & 0xffff) === 10000) continue
        const created = Number(row.create_time || 0)
        collected.push({
          order: created,
          id: `${created}:${path.basename(file)}:${row.local_id}`,
          role: sender && sender !== selfId ? 'customer' : 'agent',
          text,
          timeLabel: clock(created),
        })
      }
    }
    collected.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const visible = collected.slice(-MESSAGE_LIMIT)
    let previous = ''
    return visible.map(({ order: _order, ...message }) => {
      const show = message.timeLabel !== previous
      previous = message.timeLabel || previous
      return show ? message : { ...message, timeLabel: undefined }
    })
  }
}

function toComposer(view: AxView): ComposerView {
  return {
    trusted: view.trusted,
    running: view.running,
    hasWindow: view.hasWindow,
    hasTextArea: view.hasTextArea,
    composer: view.composer,
  }
}

function sameTitle(before: string, after: string) {
  return usableTitle(before) === usableTitle(after)
}

function titleSession(title: string): WeChatSession | null {
  const name = usableTitle(title)
  if (!name) return null
  return {
    id: `wechat-title:${name}`,
    peerName: name,
    presence: 'online',
    chatType: /[(（]\s*\d{1,5}/.test(title) ? 'group' : 'private',
    composerText: '',
    messages: [],
  }
}

function handled(ok: boolean, reason: string): HostActionResult {
  return { ok, handled: true, reason }
}

function refuseReason(reason: string) {
  if (reason !== NEED_AX) return reason
  return accessibilityDetail(app.isPackaged)
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(seconds * 1000))
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00'
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00'
  return `${hour}:${minute}`
}
