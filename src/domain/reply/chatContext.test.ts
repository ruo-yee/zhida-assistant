import { describe, expect, it } from 'vitest'
import { CHAT_CONTEXT_LIMIT, recentChatTurns } from './chatContext.ts'
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
