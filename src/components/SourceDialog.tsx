import { formatDocTitle, formatHitSummary, formatSourceTooltip } from '../domain/format.ts'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { Dialog, DialogContent } from './ui/dialog.tsx'

export function SourceDialog() {
  const app = useCompanion()
  const hit = app.sourceHit
  return (
    <Dialog open={hit !== null} onOpenChange={(open) => !open && app.closeSource()}>
      {hit ? (
        <DialogContent
          wide
          title={formatDocTitle(hit.title, hit.version)}
          description={formatSourceTooltip(hit.sourceLabel, hit.updatedAt)}
        >
          <p className="meta-line">{formatHitSummary(hit)}</p>
          {hit.body.split('\n\n').map((paragraph, index) => (
            <p className="body-para" key={`${hit.id}-${index}`}>
              {paragraph}
            </p>
          ))}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
