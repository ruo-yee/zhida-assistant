import { Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReplyCitation } from '../domain/reply/citation.ts'
import { CiteBadge } from './CiteBadge.tsx'

export function ReplyCard({
  text,
  editing,
  dirty,
  onChange,
  onStartEdit,
  onSave,
  onCancel,
  citation,
}: {
  text: string
  editing: boolean
  dirty: boolean
  onChange: (value: string) => void
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  citation?: ReplyCitation | null
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const area = areaRef.current
    if (!area) return
    area.focus()
    const length = area.value.length
    area.setSelectionRange(length, length)
    area.style.height = 'auto'
    area.style.height = `${area.scrollHeight}px`
  }, [editing])

  return (
    <div className={editing ? 'reply-card is-editing' : 'reply-card'}>
      {citation ? <CiteBadge citation={citation} /> : null}
      <button type="button" className="pencil" aria-label="编辑回复" aria-pressed={editing} onClick={onStartEdit}>
        <Pencil size={15} />
      </button>
      {editing ? (
        <textarea
          ref={areaRef}
          value={text}
          aria-label="回复草稿"
          onChange={(event) => {
            onChange(event.target.value)
            event.target.style.height = 'auto'
            event.target.style.height = `${event.target.scrollHeight}px`
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              onSave()
            }
          }}
        />
      ) : (
        <CrossfadeText text={text} />
      )}
      <span className={dirty ? 'edited-flag is-on' : 'edited-flag'} aria-hidden={!dirty}>
        已修改
      </span>
    </div>
  )
}

function CrossfadeText({ text }: { text: string }) {
  const previous = useRef(text)
  const [outgoing, setOutgoing] = useState<string | null>(null)

  useEffect(() => {
    if (previous.current === text) return
    const prior = previous.current
    setOutgoing(prior)
    const timer = window.setTimeout(() => {
      previous.current = text
      setOutgoing(null)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [text])

  return (
    <div className="cross-stack" aria-live="polite">
      {outgoing !== null ? (
        <p className="reply-copy cross-out" aria-hidden>
          {outgoing}
        </p>
      ) : null}
      <p key={text} className="reply-copy cross-in">
        {text}
      </p>
    </div>
  )
}
