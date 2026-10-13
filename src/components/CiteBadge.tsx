import type { ReplyCitation } from '../domain/reply/citation.ts'

export function CiteBadge({ citation }: { citation: ReplyCitation }) {
  return (
    <span className={citation.kind === 'kb' ? 'cite cite-kb' : 'cite cite-chat'} title={citation.source}>
      <span className="cite-label">{citation.label}</span>
      {citation.kind === 'kb' ? <span className="cite-src">{citation.source}</span> : null}
    </span>
  )
}
