import { Check, Copy, RefreshCw, Send } from 'lucide-react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { Spinner, WeChatGlyph } from './glyphs.tsx'

export function ActionBar() {
  const app = useCompanion()
  const ready = app.phase === 'ready' && app.draft.trim().length > 0
  return (
    <div className="actions">
      <button type="button" className="act" disabled={!ready} onClick={app.insertToWeChat}>
        <span className="icon-slot">
          <WeChatGlyph className="tone-green" />
        </span>
        <span className="label">插入到微信</span>
      </button>
      {app.editing ? (
        <>
          <button type="button" className="act act-primary" onClick={app.saveEdit}>
            <span className="label">保存</span>
          </button>
          <button type="button" className="act" onClick={app.cancelEdit}>
            <span className="label">取消</span>
          </button>
        </>
      ) : (
        <button
          type="button"
          className={app.sendState === 'sent' ? 'act is-success' : 'act'}
          disabled={!ready || app.sendState === 'sent'}
          onClick={app.sendSuggestion}
        >
          <span className="icon-slot">
            {app.sendState === 'sent' ? <Check size={16} className="tone-green" /> : <Send size={15} className="tone-blue" />}
          </span>
          <span className="label">{app.sendState === 'sent' ? '已发送' : '一键发送'}</span>
        </button>
      )}
      <button
        type="button"
        className="act"
        disabled={app.regen || app.editing || app.phase !== 'ready'}
        onClick={app.regenerate}
      >
        <span className="icon-slot">{app.regen ? <Spinner size={14} /> : <RefreshCw size={15} />}</span>
        <span className="label">换一批</span>
      </button>
      <button
        type="button"
        className={app.copyState === 'copied' ? 'act is-success' : 'act'}
        disabled={!ready}
        onClick={app.copySuggestion}
      >
        <span className="icon-slot">
          {app.copyState === 'copied' ? <Check size={16} className="tone-green" /> : <Copy size={15} />}
        </span>
        <span className="label">{app.copyState === 'copied' ? '已复制' : '仅复制'}</span>
      </button>
    </div>
  )
}
