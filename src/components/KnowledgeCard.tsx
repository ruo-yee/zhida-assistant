import { FileText, KeyRound, Lock, RefreshCw, Shield, Users } from 'lucide-react'
import type { KnowledgeHit } from '../domain/types.ts'
import { formatDocTitle, formatRelevance, formatSourceTooltip } from '../domain/format.ts'
import { scoreBand } from '../domain/knowledge/scoreBand.ts'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.tsx'

const ICONS = {
  doc: FileText,
  shield: Shield,
  sync: RefreshCw,
  users: Users,
  lock: Lock,
  key: KeyRound,
}

export function KnowledgeCard({
  hit,
  expanded,
  barEpoch,
  onToggle,
  onOpenSource,
}: {
  hit: KnowledgeHit
  expanded: boolean
  barEpoch: number
  onToggle: () => void
  onOpenSource: () => void
}) {
  const Icon = ICONS[hit.icon]
  const band = scoreBand(hit.score)
  const teaser = hit.body.split('\n\n')[0] ?? hit.excerpt
  return (
    <article
      className={expanded ? 'kcard is-open' : 'kcard'}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('button, a')) return
        onToggle()
      }}
    >
      <div className="flex gap-3">
        <div className="doc-icon" aria-hidden>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="m-0">
                <button type="button" className="k-title-btn" aria-expanded={expanded} onClick={onToggle}>
                  {formatDocTitle(hit.title, hit.version)}
                </button>
              </h3>
              <Tooltip>
                <TooltipTrigger>
                  <span
                    className="source"
                    tabIndex={0}
                    onClick={(event) => event.stopPropagation()}
                  >
                    来源：{hit.sourceLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{formatSourceTooltip(hit.sourceLabel, hit.updatedAt)}</TooltipContent>
              </Tooltip>
            </div>
            <div className="score-col">
              <div className="score-label">{formatRelevance(hit.score)}</div>
              <div className="score-track">
                <div
                  key={`${hit.id}-${barEpoch}`}
                  className={`score-fill is-${band}`}
                  style={{ width: `${Math.round(hit.score * 100)}%` }}
                >
                  {expanded ? <span className="score-pulse" /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="excerpt">{hit.excerpt}</p>
      <div className={expanded ? 'expand is-open' : 'expand'}>
        <div className="expand-inner">
          <p className="expand-copy">{teaser}</p>
          <button
            type="button"
            className="linkish"
            onClick={(event) => {
              event.stopPropagation()
              onOpenSource()
            }}
          >
            查看原文
          </button>
        </div>
      </div>
    </article>
  )
}
