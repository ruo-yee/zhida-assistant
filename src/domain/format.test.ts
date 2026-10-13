import { describe, expect, it } from 'vitest'
import {
  formatChatType,
  formatDocTitle,
  formatHitSummary,
  formatPresence,
  formatRelevance,
  formatResultCount,
  formatSessionChip,
  formatSourceTooltip,
} from './format.ts'

describe('retriever formatting', () => {
  it('formats relevance on a clamped two-decimal scale', () => {
    expect(formatRelevance(0.92)).toBe('相关度 0.92')
    expect(formatRelevance(0.875)).toBe('相关度 0.88')
    expect(formatRelevance(1.4)).toBe('相关度 1.00')
    expect(formatRelevance(-0.2)).toBe('相关度 0.00')
    expect(formatRelevance(Number.NaN)).toBe('相关度 0.00')
  })

  it('formats titles, counts, and the source tooltip', () => {
    expect(formatDocTitle('产品 FAQ 文档', 'v2.3')).toBe('产品 FAQ 文档 (v2.3)')
    expect(formatResultCount(2)).toBe('2 个结果')
    expect(formatSourceTooltip('官方知识库', '2026-03-18')).toBe('来自官方知识库 · 最后更新 2026-03-18')
  })

  it('formats the session chip and a hit summary', () => {
    expect(formatSessionChip('张明', 'private', '询问')).toBe('张明 · 私聊 · 意图「询问」')
    expect(formatChatType('group')).toBe('群聊')
    expect(formatPresence('online')).toBe('在线')
    expect(formatHitSummary({ title: '权限控制说明', version: 'v1.8', score: 0.87 })).toBe(
      '权限控制说明 (v1.8) · 相关度 0.87',
    )
  })
})
