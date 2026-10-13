import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { planInsert, planSend, SendGuard, cleanText } from './composerPolicy.ts'
import { isPrivateMode, keyFor, parseManifest } from './keys.ts'
import { matchChat, stripCountSuffix, usableTitle } from './matchChat.ts'
import { chatTable, decodeMessageText, indexChats, messageSelect, sqlLiteral } from './messageSql.ts'

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

describe('key manifest', () => {
  it('accepts relative paths, salt entries, and wrapped lists', () => {
    const entries = parseManifest({
      keys: [
        { path: 'contact/contact.db', enc_key: KEY_A },
        { salt: 'ab'.repeat(16), key: KEY_B },
      ],
    })
    expect(keyFor(entries, '/tmp/db_storage/contact/contact.db')).toBe(KEY_A)
    expect(keyFor(entries, '/tmp/other.db', 'ab'.repeat(16))).toBe(KEY_B)
  })

  it('rejects an ambiguous match and a world-readable mode', () => {
    const entries = parseManifest({
      'message/message_0.db': KEY_A,
      '/tmp/message/message_0.db': { enc_key: KEY_B },
    })
    expect(() => keyFor(entries, '/tmp/message/message_0.db')).toThrow(/ambiguous/)
    expect(isPrivateMode(0o100600)).toBe(true)
    expect(isPrivateMode(0o100644)).toBe(false)
  })

  it('requires mode 0600 on a real key file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'zhida-key-'))
    const file = path.join(dir, 'keys.json')
    await writeFile(file, '{}', { mode: 0o644 })
    const loose = await import('node:fs/promises').then((fs) => fs.stat(file))
    expect(isPrivateMode(loose.mode)).toBe(false)
    await chmod(file, 0o600)
    const tight = await import('node:fs/promises').then((fs) => fs.stat(file))
    expect(isPrivateMode(tight.mode)).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })
})

describe('message sql', () => {
  it('names a conversation table by the username hash and keeps the select read-only shaped', () => {
    const table = chatTable('wxid_friend')
    expect(table).toMatch(/^Msg_[0-9a-f]{32}$/)
    expect(table).toBe(chatTable('wxid_friend'))
    const sql = messageSelect(table, '', 'DESC', 30)
    expect(sql).toContain('hex(m.message_content)')
    expect(sql).not.toContain('INSERT')
    expect(sqlLiteral("a'b")).toBe(`CAST(x'${Buffer.from("a'b").toString('hex')}' AS TEXT)`)
  })

  it('decodes plain text, strips the group sender prefix, and labels images', () => {
    expect(decodeMessageText(Buffer.from('你好'), 1, 'wxid_a', null)).toBe('你好')
    expect(decodeMessageText(Buffer.from('wxid_a:\n到了'), 1, 'room@chatroom', 'wxid_a')).toBe('到了')
    expect(decodeMessageText(Buffer.from(''), 3, 'wxid_a', null)).toBe('[图片]')
  })

  it('maps a message table back to one contact', () => {
    const username = 'wxid_friend'
    const chats = indexChats(
      [{ username, nick_name: '好友', remark: '张三', is_in_chat_room: 0 }],
      [chatTable(username), 'not_a_message'],
    )
    expect(chats).toHaveLength(1)
    expect(chats[0]?.chatName).toBe('张三')
    expect(matchChat('张三', chats)?.chatId).toBe(username)
    expect(matchChat('金驹出租房屋群 (291)', chats)).toBeNull()
    expect(usableTitle('微信')).toBe('')
    expect(stripCountSuffix('项目群 (12)')).toBe('项目群')
  })
})

describe('composer policy', () => {
  const ready = { trusted: true, running: true, hasWindow: true, hasTextArea: true, composer: '' }

  it('inserts into an empty composer and never chooses Return', () => {
    expect(planInsert(ready, ' 你好\n')).toEqual({ action: 'set', text: '你好' })
    expect(planInsert({ ...ready, composer: '草稿' }, '你好').action).toBe('refuse')
    expect(planInsert(ready, '你好').action).not.toBe('return')
    expect(cleanText('a\nb')).toBe('a b')
  })

  it('sends only when the composer already matches, and dedupes Return', () => {
    expect(planSend({ ...ready, composer: '你好' }, '你好')).toEqual({ action: 'return', text: '你好' })
    expect(planSend({ ...ready, composer: '别的' }, '你好').action).toBe('refuse')
    const guard = new SendGuard()
    expect(guard.claim('return', '1', '你好', 0).ok).toBe(true)
    guard.finish('return', '1', '你好', true, 10)
    expect(guard.claim('return', '1', '你好', 1000).ok).toBe(false)
    expect(guard.claim('return', '1', '你好', 4000).ok).toBe(true)
  })
})
