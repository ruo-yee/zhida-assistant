import { describe, expect, it } from 'vitest'
import { SEED_CUSTOMER_TEXTS } from '../wechat/seed.ts'
import { CORPUS } from '../knowledge/corpus.ts'
import { rankDocuments } from '../knowledge/rank.ts'
import { BASELINE_REPLY } from './mockReplies.ts'
import { buildChatVariants } from './chatReplies.ts'
import { fillThree, parseReplyBatch } from './parseReplies.ts'
import { migratePersonaSettings, personaPrompt, voiceOf } from './personas.ts'
import { createReplyGenerator, groundingFor } from './ReplyGenerator.ts'

describe('groundingFor', () => {
  it('keeps a strong inquiry on citations and chats when the hit is weak', () => {
    expect(groundingFor('询问', [{ score: 0.92 }])).toBe('grounded')
    expect(groundingFor('询问', [{ score: 0.64 }])).toBe('chat')
    expect(groundingFor('询问', [])).toBe('chat')
    expect(groundingFor('闲聊', [{ score: 0.92 }])).toBe('chat')
    expect(groundingFor('确认', [{ score: 0.92 }])).toBe('chat')
  })
})

describe('parseReplyBatch', () => {
  it('reads delimited, numbered, and JSON replies', () => {
    expect(parseReplyBatch('第一条\n---\n第二条\n---\n第三条')).toEqual(['第一条', '第二条', '第三条'])
    expect(parseReplyBatch('1. 甲\n2. 乙\n3. 丙')).toEqual(['甲', '乙', '丙'])
    expect(parseReplyBatch('{"replies":["一","二","三"]}')).toEqual(['一', '二', '三'])
  })

  it('fills a short model answer up to three drafts', () => {
    expect(fillThree(['只要这一条'], ['甲', '乙', '丙'])).toEqual(['只要这一条', '甲', '乙'])
  })
})

describe('chat and persona drafts', () => {
  it('writes three short chat lines without product facts', () => {
    const lines = buildChatVariants({
      tone: 'professional',
      voice: 'support',
      intent: '闲聊',
      customerText: '今天天气怎么样，适合出门吗？',
    })
    expect(lines).toHaveLength(3)
    const joined = lines.join('\n')
    expect(joined).not.toMatch(/离线|增量同步|权限|资源 \+ 操作/)
  })

  it('keeps the citation draft for the default support role', async () => {
    const hits = rankDocuments(SEED_CUSTOMER_TEXTS.join('\n'), CORPUS)
    const generator = createReplyGenerator({
      resolveConfig: () => ({ mode: 'local', apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b' }),
    })
    const batch = await generator.generate({
      persona: 'professional',
      voice: 'support',
      personaText: personaPrompt('support', []),
      intent: '询问',
      customerText: SEED_CUSTOMER_TEXTS.at(-1) ?? '',
      grounding: 'grounded',
      hits,
    })
    expect(batch.provider).toBe('mock')
    expect(batch.variants[0]).toBe(BASELINE_REPLY)
    expect(batch.variants).toHaveLength(3)
  })

  it('keeps API voice on the citation without leaking setup instructions', async () => {
    const hits = rankDocuments(SEED_CUSTOMER_TEXTS.join('\n'), CORPUS)
    const generator = createReplyGenerator({
      resolveConfig: () => ({ mode: 'local', apiKey: '', baseUrl: '', model: '' }),
    })
    const batch = await generator.generate({
      persona: 'professional',
      voice: 'api',
      personaText: personaPrompt('api', []),
      intent: '询问',
      customerText: SEED_CUSTOMER_TEXTS.at(-1) ?? '',
      grounding: 'grounded',
      hits,
    })
    expect(batch.variants[0]?.startsWith('关于您问的两点，文档里是这样写的：')).toBe(true)
    expect(batch.variants[0]).toContain('资源 + 操作')
    expect(batch.variants.join('\n')).not.toMatch(/按你设定的人设|按平台客服的口径/)
  })
})

describe('persona catalog', () => {
  it('keeps builtins and migrates an older custom prompt', () => {
    expect(voiceOf('casual')).toBe('casual')
    expect(voiceOf('c_abc')).toBe('custom')
    expect(personaPrompt('advisor', [])).toContain('专业顾问')
    const migrated = migratePersonaSettings({ personaRole: 'custom', customPersona: '用短句，先复述目标。' })
    expect(migrated.activePersonaId).toBe('c_migrated')
    expect(migrated.customPersonas[0]?.name).toBe('自定义人设')
    expect(migratePersonaSettings({ personaRole: 'api' }).activePersonaId).toBe('api')
    expect(migratePersonaSettings({}).activePersonaId).toBe('support')
  })
})
