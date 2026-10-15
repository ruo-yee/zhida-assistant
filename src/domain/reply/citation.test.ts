import { describe, expect, it } from 'vitest'
import { citationForReply } from './citation.ts'
import { QUICK_PERSONAS } from './personas.ts'

describe('citation badges', () => {
  it('names the knowledge source when the reply is grounded', () => {
    expect(
      citationForReply('grounded', [
        { title: '权限控制说明', version: 'v1.8' },
        { title: '产品 FAQ', version: 'v2.3' },
      ]),
    ).toEqual({ kind: 'kb', label: '知识库', source: '权限控制说明 v1.8 等 2 篇' })
  })

  it('marks a chat-only reply even if a weak hit was retrieved', () => {
    expect(citationForReply('chat', [{ title: '权限控制说明', version: 'v1.8' }])).toEqual({
      kind: 'chat',
      label: '仅会话',
      source: '只根据当前微信对话',
    })
    expect(citationForReply('grounded', [])).toMatchObject({ kind: 'chat', label: '仅会话' })
  })

  it('offers 客服, 闲聊, and 顾问 for the same message', () => {
    expect(QUICK_PERSONAS.map((item) => item.label)).toEqual(['客服', '闲聊', '顾问'])
    expect(QUICK_PERSONAS.map((item) => item.id)).toEqual(['support', 'casual', 'advisor'])
  })
})