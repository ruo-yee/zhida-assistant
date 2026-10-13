import { describe, expect, it } from 'vitest'
import { SEED_CUSTOMER_TEXTS } from '../wechat/seed.ts'
import { CORPUS } from '../knowledge/corpus.ts'
import { rankDocuments } from '../knowledge/rank.ts'
import { BASELINE_REPLY, buildMockVariants } from './mockReplies.ts'

describe('buildMockVariants', () => {
  it('keeps the approved dual-topic draft for the professional persona', () => {
    const hits = rankDocuments(SEED_CUSTOMER_TEXTS.join('\n'), CORPUS)
    const variants = buildMockVariants({ persona: 'professional', hits })
    expect(variants).toHaveLength(3)
    expect(variants[0]).toBe(BASELINE_REPLY)
    expect(new Set(variants).size).toBe(3)
  })

  it('softens the same draft for the warm persona', () => {
    const hits = rankDocuments(SEED_CUSTOMER_TEXTS.join('\n'), CORPUS)
    const variants = buildMockVariants({ persona: 'warm', hits })
    expect(variants[0]?.startsWith('好的，')).toBe(true)
    expect(variants[0]).toContain('资源 + 操作')
  })
})
