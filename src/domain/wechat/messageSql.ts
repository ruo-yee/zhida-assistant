import { createHash } from 'node:crypto'
import { decompress as decompressZstd } from 'fzstd'

const CHAT_TABLE = /^Msg_[0-9a-f]{32}$/
const MAX_ZSTD_OUTPUT = 10 * 1024 * 1024
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

const TYPE_LABEL: Record<number, string> = {
  3: '[图片]',
  34: '[语音]',
  43: '[视频]',
  47: '[表情]',
  48: '[位置]',
  49: '[链接]',
  10000: '[系统消息]',
}

export function chatTable(chatId: string) {
  return `Msg_${createHash('md5').update(chatId, 'utf8').digest('hex')}`
}

export function sqlLiteral(value: string) {
  return `CAST(x'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`
}

export function afterClause(created: number, localId: number) {
  const time = Math.trunc(created)
  const local = Math.trunc(localId)
  return `(m.create_time > ${time} OR (m.create_time = ${time} AND m.local_id > ${local}))`
}

export function messageSelect(table: string, where: string, order: 'ASC' | 'DESC', limit: number) {
  if (!CHAT_TABLE.test(table)) throw new Error('invalid conversation table')
  if (order !== 'ASC' && order !== 'DESC') throw new Error('invalid sort order')
  const bounded = Math.trunc(limit)
  if (bounded < 1 || bounded > 200) throw new Error('limit must be between 1 and 200')
  return (
    'SELECT m.local_id AS local_id, m.server_id AS server_id, ' +
    'm.local_type AS local_type, m.create_time AS create_time, ' +
    'm.real_sender_id AS real_sender_id, n.user_name AS sender_id, ' +
    'hex(m.message_content) AS body, hex(m.packed_info_data) AS packed ' +
    `FROM "${table}" AS m LEFT JOIN Name2Id AS n ON n.rowid = m.real_sender_id` +
    `${where} ORDER BY m.create_time ${order}, m.local_id ${order} LIMIT ${bounded}`
  )
}

export function decodeMessageText(raw: Buffer, localType: number, chatId: string, senderId: string | null) {
  const kind = localType & 0xffff
  if (kind !== 1) return TYPE_LABEL[kind] ?? null
  let body = raw
  if (body.subarray(0, 4).equals(ZSTD_MAGIC)) {
    try {
      const inflated = Buffer.from(decompressZstd(body))
      if (inflated.length > MAX_ZSTD_OUTPUT) return null
      body = inflated
    } catch {
      return null
    }
  }
  let text: string
  try {
    text = body.toString('utf8')
  } catch {
    return null
  }
  if (chatId.endsWith('@chatroom') && senderId) {
    const prefix = `${senderId}:\n`
    if (text.startsWith(prefix)) text = text.slice(prefix.length)
  }
  const trimmed = text.trim()
  return trimmed || null
}

export interface ContactRow {
  username: string
  nick_name?: string | null
  remark?: string | null
  is_in_chat_room?: string | number | null
}

export interface IndexedChat {
  chatId: string
  chatName: string
  aliases: string[]
  group: boolean
  tables: string[]
}

export function indexChats(contacts: ContactRow[], tableNames: string[]): IndexedChat[] {
  const byTable = new Map<string, IndexedChat>()
  for (const row of contacts) {
    const username = String(row.username || '')
    if (!username) continue
    const aliases = [row.remark, row.nick_name, username].filter((value): value is string => Boolean(value))
    byTable.set(chatTable(username), {
      chatId: username,
      chatName: row.remark || row.nick_name || username,
      aliases,
      group: username.endsWith('@chatroom') || String(row.is_in_chat_room ?? '') === '1',
      tables: [],
    })
  }
  const indexed = new Map<string, IndexedChat>()
  for (const name of tableNames) {
    if (!CHAT_TABLE.test(name)) continue
    const meta = byTable.get(name)
    if (!meta) continue
    const existing = indexed.get(meta.chatId)
    if (existing) existing.tables.push(name)
    else indexed.set(meta.chatId, { ...meta, tables: [name] })
  }
  return [...indexed.values()]
}
