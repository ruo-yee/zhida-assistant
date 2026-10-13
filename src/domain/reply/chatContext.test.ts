import { describe, expect, it } from 'vitest'
import {
  CHAT_CONTEXT_LIMIT,
  recentChatTurns,
  rememberOutbound,
  turnsWithOutbound,
  type PendingOutbound,
} from './chatContext.ts'
import { buildModelMessages } from './openaiReply.ts'
import type { ReplyInput } from './ReplyGenerator.ts'

const input: ReplyInput = {
  persona: 'professional',
  voice: 'support',
  personaText: '客服助手',
  intent: '询问',
  customerText: '第二个问题是权限粒度',
  turns: [
    { role: 'customer', text: '离线模式下数据同步怎么处理？' },
    { role: 'agent', text: '断网时先记在本地，恢复后增量同步。' },
    { role: 'customer', text: '第二个问题是权限粒度' },
  ],
  grounding: 'grounded',
  hits: [
    {
      id: 'acl',
      title: '权限说明',
      version: 'v3',
      excerpt: '最小粒度是资源加操作。',
      score: 0.91,
    },
  ],
}

describe('chat context in the model prompt', () => {
  it('sends the recent WeChat turns as 上下文 and keeps knowledge hits separate', () => {
    const [system, user] = buildModelMessages(input)
    expect(system?.content).toContain('上下文指当前微信会话')
    expect(system?.content).toContain('不是知识库')
    expect(system?.content).toContain('客服助手')
    expect(system?.content).toContain('语气专业、简明')
    const text = user?.content ?? ''
    const knowledgeAt = text.indexOf('知识摘录')
    const context = text.slice(0, knowledgeAt)
    const knowledge = text.slice(knowledgeAt)
    expect(context).toContain('上下文（当前微信会话的最近消息，不是知识库）')
    expect(context).toContain('对方：离线模式下数据同步怎么处理？')
    expect(context).toContain('我：断网时先记在本地，恢复后增量同步。')
    expect(context).toContain('对方：第二个问题是权限粒度')
    expect(knowledge.startsWith('知识摘录（可选补充）')).toBe(true)
    expect(knowledge).toContain('最小粒度是资源加操作')
    expect(knowledge).not.toContain('上下文')
  })

  it('still attaches knowledge hits for a chat turn when the search found some', () => {
    const [system, user] = buildModelMessages({ ...input, grounding: 'chat', intent: '闲聊' })
    expect(system?.content).toContain('人设：客服助手')
    const text = user?.content ?? ''
    const knowledgeAt = text.indexOf('知识摘录')
    expect(text.slice(0, knowledgeAt)).toContain('我：断网时先记在本地，恢复后增量同步。')
    expect(text.slice(knowledgeAt)).toContain('最小粒度是资源加操作')
    expect(text.slice(knowledgeAt)).not.toContain('上下文')
  })

  it('keeps only the newest turns', () => {
    const messages = Array.from({ length: CHAT_CONTEXT_LIMIT + 3 }, (_, index) => ({
      role: index % 2 === 0 ? ('customer' as const) : ('agent' as const),
      text: `第${index}条`,
    }))
    const turns = recentChatTurns(messages)
    expect(turns).toHaveLength(CHAT_CONTEXT_LIMIT)
    expect(turns[0]?.text).toBe('第3条')
    expect(turns.at(-1)?.text).toBe(`第${CHAT_CONTEXT_LIMIT + 2}条`)
  })
})

const history = [
  { id: 'c1', role: 'customer' as const, text: '离线模式下数据同步怎么处理？' },
  { id: 'a1', role: 'agent' as const, text: '断网时先记在本地。' },
  { id: 'c2', role: 'customer' as const, text: '第二个问题是权限粒度' },
]

describe('outbound replies in the next context', () => {
  it('places an inserted or sent line after the message that was current, before newer incoming lines', () => {
    const pending = rememberOutbound([], {
      sessionId: 'zhang',
      anchorId: 'c2',
      text: '最小粒度是资源加操作。',
    })
    const withIncoming = [
      ...history,
      { id: 'c3', role: 'customer' as const, text: '那删除操作呢？' },
    ]
    const { turns } = turnsWithOutbound('zhang', withIncoming, pending)
    expect(turns.map((turn) => `${turn.role}:${turn.text}`)).toEqual([
      'customer:离线模式下数据同步怎么处理？',
      'agent:断网时先记在本地。',
      'customer:第二个问题是权限粒度',
      'agent:最小粒度是资源加操作。',
      'customer:那删除操作呢？',
    ])
    const [system, user] = buildModelMessages({ ...input, turns, customerText: '那删除操作呢？' })
    expect(system?.content).toContain('上下文指当前微信会话')
    const text = user?.content ?? ''
    const context = text.slice(0, text.indexOf('知识摘录'))
    expect(context).toContain('我：最小粒度是资源加操作。')
    expect(context.indexOf('我：最小粒度是资源加操作。')).toBeLessThan(context.indexOf('对方：那删除操作呢？'))
  })

  it('replaces an earlier draft on the same anchor when the user inserts again or then sends', () => {
    const inserted = rememberOutbound([], { sessionId: 'zhang', anchorId: 'c2', text: '先写一版' })
    const sent = rememberOutbound(inserted, { sessionId: 'zhang', anchorId: 'c2', text: '  改完再发出去  ' })
    expect(sent).toEqual<PendingOutbound[]>([
      { sessionId: 'zhang', anchorId: 'c2', text: '改完再发出去' },
    ])
    const { turns } = turnsWithOutbound('zhang', history, sent)
    expect(turns.filter((turn) => turn.role === 'agent').map((turn) => turn.text)).toEqual([
      '断网时先记在本地。',
      '改完再发出去',
    ])
  })

  it('keeps an earlier reply when a later message is answered too', () => {
    const first = rememberOutbound([], { sessionId: 'zhang', anchorId: 'c2', text: '先回答权限。' })
    const second = rememberOutbound(first, { sessionId: 'zhang', anchorId: 'c3', text: '删除也可以单独授权。' })
    const messages = [...history, { id: 'c3', role: 'customer' as const, text: '那删除操作呢？' }]
    const { turns } = turnsWithOutbound('zhang', messages, second)
    expect(turns.map((turn) => turn.text)).toEqual([
      '离线模式下数据同步怎么处理？',
      '断网时先记在本地。',
      '第二个问题是权限粒度',
      '先回答权限。',
      '那删除操作呢？',
      '删除也可以单独授权。',
    ])
  })

  it('drops the pending copy once the loaded history already contains that reply', () => {
    const pending = rememberOutbound([], { sessionId: 'zhang', anchorId: 'c2', text: '最小粒度是资源加操作。' })
    const caughtUp = [
      ...history,
      { id: 'a2', role: 'agent' as const, text: '最小粒度是资源加操作。' },
      { id: 'c3', role: 'customer' as const, text: '那删除操作呢？' },
    ]
    const { turns, pending: left } = turnsWithOutbound('zhang', caughtUp, pending)
    expect(left).toEqual([])
    expect(turns.filter((turn) => turn.text === '最小粒度是资源加操作。')).toHaveLength(1)
    expect(turns.at(-1)?.text).toBe('那删除操作呢？')
  })

  it('puts a reply sent before any loaded message ahead of messages that arrive later', () => {
    const pending = rememberOutbound([], { sessionId: 'zhang', anchorId: '', text: '先说结论。' })
    const { turns } = turnsWithOutbound('zhang', [{ id: 'c1', role: 'customer', text: '还有呢？' }], pending)
    expect(turns.map((turn) => `${turn.role}:${turn.text}`)).toEqual(['agent:先说结论。', 'customer:还有呢？'])
  })

  it('does not append a reply whose anchor has left the loaded window', () => {
    const pending = rememberOutbound([], { sessionId: 'zhang', anchorId: 'gone', text: '旧回复' })
    const { turns, pending: left } = turnsWithOutbound('zhang', history, pending)
    expect(left).toEqual([])
    expect(turns.some((turn) => turn.text === '旧回复')).toBe(false)
  })

  it('keeps another chat’s pending reply while reading this chat', () => {
    const pending = rememberOutbound([], { sessionId: 'other', anchorId: 'x', text: '别的会话' })
    const { turns, pending: left } = turnsWithOutbound('zhang', history, pending)
    expect(turns.some((turn) => turn.text === '别的会话')).toBe(false)
    expect(left).toEqual(pending)
  })
})
