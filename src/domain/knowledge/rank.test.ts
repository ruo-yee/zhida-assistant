import { describe, expect, it } from 'vitest'
import { DEMO_PROMPTS, SEED_CUSTOMER_TEXTS } from '../wechat/seed.ts'
import { scoreBand } from './scoreBand.ts'
import { CORPUS } from './corpus.ts'
import { createKnowledgeRetriever } from './KnowledgeRetriever.ts'
import { keywordScore, rankDocuments } from './rank.ts'

const seedQuery = SEED_CUSTOMER_TEXTS.join('\n')

describe('rankDocuments', () => {
  it('returns the baseline FAQ and permission notes with locked scores', () => {
    const hits = rankDocuments(seedQuery, CORPUS)
    expect(hits.map((hit) => hit.id)).toEqual(['faq-offline', 'acl'])
    expect(hits[0]?.score).toBe(0.92)
    expect(hits[1]?.score).toBe(0.87)
    expect(scoreBand(hits[0]?.score ?? 0)).toBe('high')
    expect(scoreBand(hits[1]?.score ?? 0)).toBe('mid')
  })

  it('follows an offline question to the sync notes', () => {
    const hits = rankDocuments(DEMO_PROMPTS[0].text, CORPUS)
    expect(hits.map((hit) => hit.id)).toEqual(['faq-offline', 'sync-strategy'])
    expect(hits[1]?.score).toBe(0.88)
  })

  it('follows a permission question to the role example', () => {
    const hits = rankDocuments(DEMO_PROMPTS[1].text, CORPUS)
    expect(hits.map((hit) => hit.id)).toEqual(['acl', 'rbac'])
    expect(hits[0]?.score).toBe(0.91)
    expect(hits[1]?.score).toBe(0.86)
  })

  it('returns nothing for an unrelated question and drops single-keyword noise', () => {
    expect(rankDocuments(DEMO_PROMPTS[2].text, CORPUS)).toEqual([])
    expect(keywordScore('只提到同步', ['同步', '增量', '一致性', '缓存'], ['增量'])).toBe(0.64)
  })

  it('keeps both seed topics because the latest line continues the thread', async () => {
    const retriever = createKnowledgeRetriever()
    const hits = await retriever.search({
      messages: [
        { role: 'customer', text: SEED_CUSTOMER_TEXTS[0] },
        { role: 'agent', text: '增量同步已经在上一句坐席回复里，不应单独抬高同步文档。' },
        { role: 'customer', text: SEED_CUSTOMER_TEXTS[1] },
        { role: 'customer', text: SEED_CUSTOMER_TEXTS[2] },
      ],
      enabledDocIds: ['faq-offline', 'acl', 'sync-strategy'],
    })
    expect(hits.map((hit) => hit.id)).toEqual(['faq-offline', 'acl'])
  })

  it('drops earlier topics when the newest question does not match', async () => {
    const retriever = createKnowledgeRetriever()
    const hits = await retriever.search({
      messages: [
        { role: 'customer', text: SEED_CUSTOMER_TEXTS[1] },
        { role: 'customer', text: SEED_CUSTOMER_TEXTS[2] },
        { role: 'customer', text: DEMO_PROMPTS[2].text },
      ],
    })
    expect(hits).toEqual([])
  })
})
