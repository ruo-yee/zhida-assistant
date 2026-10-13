import type { ReplyGrounding } from './ReplyGenerator.ts'

export interface ReplyCitation {
  kind: 'kb' | 'chat'
  label: string
  source: string
}

/** A candidate either cites the knowledge excerpt or only the current WeChat chat. */
export function citationForReply(
  grounding: ReplyGrounding,
  hits: Array<{ title: string; version?: string }>,
): ReplyCitation {
  if (grounding === 'grounded' && hits.length > 0) {
    const top = hits[0]
    const name = [top?.title, top?.version].filter(Boolean).join(' ')
    const extra = hits.length > 1 ? ` 等 ${hits.length} 篇` : ''
    return { kind: 'kb', label: '知识库', source: `${name}${extra}` }
  }
  return { kind: 'chat', label: '仅会话', source: '只根据当前微信对话' }
}
