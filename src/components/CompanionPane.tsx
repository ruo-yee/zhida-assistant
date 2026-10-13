import { BookOpen, Lightbulb, Moon, MoreHorizontal, Settings, Sparkles, Sun } from 'lucide-react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { formatChatType, formatResultCount, formatSessionChip } from '../domain/format.ts'
import { ActionBar } from './ActionBar.tsx'
import { DemoMenuItems } from './DemoMenu.tsx'
import { DockStatusBar } from './DockStatusBar.tsx'
import { KnowledgeCard } from './KnowledgeCard.tsx'
import { ReplyCard } from './ReplyCard.tsx'
import { EmptyState, ErrorState, ReplySkeleton, SkeletonState } from './States.tsx'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/dropdown.tsx'

export function CompanionPane({ hidden }: { hidden: boolean }) {
  const app = useCompanion()
  const chatLabel = formatChatType(app.focusSession.chatType)
  return (
    <section
      className={hidden ? 'companion is-hidden' : 'companion'}
      aria-label="智答助手"
      aria-busy={app.phase === 'loading'}
    >
      <DockStatusBar />
      <header className="pane-header flex items-center gap-2 px-3">
        <div className="brand">
          <Sparkles size={18} />
          智答助手
        </div>
        <div className="chip" title={formatSessionChip(app.focusSession.peerName, app.focusSession.chatType, app.intent)}>
          {app.focusSession.peerName} · {chatLabel} ·{' '}
          <span key={app.intentFlashKey} className={app.intentFlashKey > 0 ? 'intent-flash' : undefined}>
            意图「{app.intent}」
          </span>
        </div>
        <div className="ml-auto">
          <Menu>
            <MenuTrigger>
              <button type="button" className="icon-btn" aria-label="助手菜单">
                <MoreHorizontal size={18} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => app.setSettingsOpen(true)}>
                <Settings size={15} /> 设置
              </MenuItem>
              <MenuItem onSelect={app.toggleTheme}>
                {app.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                {app.theme === 'dark' ? '浅色模式' : '深色模式'}
              </MenuItem>
              {window.zhida ? (
                <MenuItem onSelect={() => void window.zhida?.reattach()}>重新贴到微信</MenuItem>
              ) : null}
              <MenuSeparator />
              <DemoMenuItems />
            </MenuContent>
          </Menu>
        </div>
      </header>
      <div className="pane-scroll scroll">
        <div className="section-title">
          <BookOpen size={16} />
          知识检索
          {app.phase === 'ready' || app.phase === 'empty' ? (
            <span className="meta">{formatResultCount(app.hits.length)}</span>
          ) : null}
        </div>
        {app.phase === 'loading' ? <SkeletonState /> : null}
        {app.phase === 'error' ? <ErrorState /> : null}
        {app.phase === 'ready' && app.hits.length === 0 ? <EmptyState /> : null}
        {app.phase === 'ready' && app.hits.length > 0 ? (
          <div className="card-list fade-in">
            {app.hits.map((hit) => (
              <KnowledgeCard
                key={hit.id}
                hit={hit}
                expanded={app.expandedId === hit.id}
                barEpoch={app.barEpoch}
                onToggle={() => app.toggleExpanded(hit.id)}
                onOpenSource={() => app.openSource(hit.id)}
              />
            ))}
          </div>
        ) : null}

        <div className="section-title">
          <Lightbulb size={16} style={{ color: '#f5a524' }} />
          回复建议
          {app.phase === 'ready' && app.variantCount > 0 ? (
            <span className="meta">
              {app.provider === 'openai' ? '模型 · ' : ''}
              {app.replyMode === 'chat' ? '人设草稿 · ' : '依据摘录 · '}
              {app.variantIndex + 1} / {app.variantCount}
            </span>
          ) : null}
        </div>
        {app.phase === 'loading' ? <ReplySkeleton /> : null}
        {app.phase === 'ready' ? (
          <div className="reply-wrap fade-in">
            {app.variants.length > 0 ? (
              <div className="candidates" role="radiogroup" aria-label="回复候选">
                <p className="candidate-hint">点一条候选，或在下面改完再插入。发送仍要再点一次。</p>
                {app.variants.map((text, index) => (
                  <button
                    key={`${index}-${text.slice(0, 24)}`}
                    type="button"
                    role="radio"
                    aria-checked={app.variantIndex === index}
                    className={app.variantIndex === index ? 'candidate is-on' : 'candidate'}
                    onClick={() => app.selectVariant(index)}
                  >
                    <span className="candidate-n">{index + 1}</span>
                    <span className="candidate-text">{text}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <ReplyCard
              text={app.draft}
              editing={app.editing}
              dirty={app.dirty}
              onChange={app.setDraft}
              onStartEdit={app.startEdit}
              onSave={app.saveEdit}
              onCancel={app.cancelEdit}
            />
            {app.warning ? <p className="warn">{app.warning}</p> : null}
          </div>
        ) : null}
        {app.phase === 'error' ? (
          <div className="reply-wrap">
            <p className="quiet">检索失败时不生成回复。</p>
          </div>
        ) : null}
      </div>
      <ActionBar />
    </section>
  )
}
