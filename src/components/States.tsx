import { useCompanion } from '../app/CompanionProvider.tsx'
import { Button } from './ui/button.tsx'
import { EmptyArt } from './glyphs.tsx'

export function SkeletonState() {
  return (
    <div className="card-list" aria-hidden>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

export function ReplySkeleton() {
  return (
    <div className="reply-wrap" aria-hidden>
      <div className="reply-card">
        <div className="skel skel-line w-full" />
        <div className="skel skel-line mt-3 w-11/12" />
        <div className="skel skel-line mt-3 w-4/5" />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="kcard">
      <div className="flex gap-3">
        <div className="skel skel-icon" />
        <div className="flex-1">
          <div className="skel skel-line w-2/3" />
          <div className="skel skel-line mt-2 w-1/3" />
        </div>
      </div>
      <div className="skel skel-line mt-3 w-full" />
      <div className="skel skel-line mt-2 w-5/6" />
    </div>
  )
}

export function EmptyState() {
  const app = useCompanion()
  if (app.emptyReason === 'disabled') {
    return (
      <div className="empty">
        <EmptyArt />
        <p>知识库里的文档都关掉了。</p>
        <p className="empty-breathe">下面仍按当前人设起草了回复</p>
        <button type="button" className="linkish" onClick={() => app.openSettings('knowledge')}>
          去设置里打开一份文档
        </button>
      </div>
    )
  }
  return (
    <div className="empty">
      <EmptyArt />
      <p>没有匹配的知识条目</p>
      <p className="empty-breathe">{app.replyMode === 'chat' ? '已按当前人设起草回复' : '换个问法试试'}</p>
    </div>
  )
}

export function ErrorState() {
  const app = useCompanion()
  return (
    <div className="card-list">
      <article className="kcard is-error" role="alert">
        <div className="score-label">相关度</div>
        <div className="score-track shake" key={app.errorEpoch}>
          <div className="score-fill is-danger" style={{ width: '72%' }} />
        </div>
        <p className="error-copy">知识库这次没有返回，相关度无法计算。可以重试，或换一条客户问题。</p>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={app.retry}>
            重试
          </Button>
        </div>
      </article>
    </div>
  )
}
