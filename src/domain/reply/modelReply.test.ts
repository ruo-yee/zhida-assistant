import { describe, expect, it } from 'vitest'
import { createReplyGenerator, usesModel } from './ReplyGenerator.ts'
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

const ollama = { mode: 'openai' as const, apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' }

describe('model replies', () => {
  it('calls the configured endpoint with the chat context and does not invent a cloud host', async () => {
    expect(usesModel(ollama)).toBe(true)
    expect(usesModel({ ...ollama, mode: 'local' })).toBe(false)
    const original = globalThis.fetch
    let url = ''
    let body = ''
    globalThis.fetch = async (resource, init) => {
      url = String(resource)
      body = String(init?.body ?? '')
      return new Response(JSON.stringify({ choices: [{ message: { content: '甲\n---\n乙\n---\n丙' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    try {
      const batch = await createReplyGenerator({ resolveConfig: () => ollama }).generate(input)
      expect(batch.provider).toBe('openai')
      expect(batch.variants).toEqual(['甲', '乙', '丙'])
      expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions')
      expect(body).toContain('离线模式下数据同步怎么处理？')
      expect(body).toContain('我：断网时先记在本地，恢复后增量同步。')
      expect(body).toContain('最小粒度是资源加操作')
      expect(body).not.toContain('api.openai.com')
    } finally {
      globalThis.fetch = original
    }
  })

  it('falls back to local drafts when the model cannot be reached', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('offline')
    }
    try {
      const batch = await createReplyGenerator({ resolveConfig: () => ollama }).generate(input)
      expect(batch.provider).toBe('mock')
      expect(batch.warning).toContain('本地草稿')
      expect(batch.variants).toHaveLength(3)
    } finally {
      globalThis.fetch = original
    }
  })
})
