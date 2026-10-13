import { ChevronLeft, MoreHorizontal, Paperclip, Phone, Search, Smile } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { formatPresence } from '../domain/format.ts'
import { AgentAvatar, CustomerAvatar, Spinner } from './glyphs.tsx'
import { DemoMenuItems } from './DemoMenu.tsx'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './ui/dropdown.tsx'

const EMOJIS = ['😀', '😄', '🙂', '😉', '👍', '🙏', '👌', '🎉']

export function WeChatPane({ hidden }: { hidden: boolean }) {
  const app = useCompanion()
  const scroller = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const query = app.searchQuery.trim()
  const visible = query ? app.session.messages.filter((message) => message.text.includes(query)) : app.session.messages

  useEffect(() => {
    if (query) return
    const node = scroller.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
  }, [app.session.messages.length, app.echo?.id, query])

  useEffect(() => {
    if (!app.echo) return
    const area = composerRef.current
    area?.focus()
    const length = area?.value.length ?? 0
    area?.setSelectionRange(length, length)
  }, [app.echo?.id])

  return (
    <section className={hidden ? 'wechat is-hidden' : 'wechat'} aria-label="微信演示">
      <header className="pane-header flex items-center gap-2 px-2 py-2">
        <button type="button" className="icon-btn" aria-label="返回" onClick={() => app.notify('演示窗口没有上一页')}>
          <ChevronLeft size={20} />
        </button>
        <div className="avatar-wrap">
          <CustomerAvatar />
          {app.session.presence === 'online' ? <span className="online-dot" /> : null}
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="name">{app.session.peerName}</span>
            <span className="online">{formatPresence(app.session.presence)}</span>
          </div>
          <div className="demo-mark">演示窗 · 不是微信官方客户端</div>
        </div>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            className="icon-btn"
            aria-label="搜索消息"
            aria-pressed={app.searchOpen}
            onClick={() => app.setSearchOpen(!app.searchOpen)}
          >
            <Search size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="语音通话" onClick={() => app.notify('演示窗口不能发起通话')}>
            <Phone size={18} />
          </button>
          <Menu>
            <MenuTrigger>
              <button type="button" className="icon-btn" aria-label="会话菜单">
                <MoreHorizontal size={18} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <DemoMenuItems />
            </MenuContent>
          </Menu>
        </div>
      </header>
      {app.searchOpen ? (
        <div className="search-row">
          <input
            value={app.searchQuery}
            placeholder="搜索当前会话"
            aria-label="搜索当前会话"
            onChange={(event) => app.setSearchQuery(event.target.value)}
          />
        </div>
      ) : null}
      <div className="messages scroll" ref={scroller}>
        {visible.length === 0 ? <div className="search-empty">没有匹配的消息</div> : null}
        {visible.map((message) => (
          <div key={message.id} className="contents">
            {message.timeLabel ? <div className="time-label">{message.timeLabel}</div> : null}
            <div className={message.role === 'agent' ? 'msg agent' : 'msg customer'}>
              {message.role === 'agent' ? <AgentAvatar /> : <CustomerAvatar />}
              <div className={message.id === app.popId ? 'bubble pop' : 'bubble'}>
                <Highlight text={message.text} query={query} />
              </div>
            </div>
          </div>
        ))}
        {app.echo && !query ? (
          <div className="msg agent" key={app.echo.id}>
            <AgentAvatar />
            <div className="bubble insert-bubble">
              <div className="draft-tag">待发送</div>
              {app.echo.text}
            </div>
          </div>
        ) : null}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          app.sendComposer()
        }}
      >
        <textarea
          ref={composerRef}
          value={app.session.composerText}
          aria-label="微信输入框"
          onChange={(event) => app.setComposerText(event.target.value)}
        />
        <div className="composer-bar">
          <div className="flex items-center">
            <Menu>
              <MenuTrigger>
                <button type="button" className="icon-btn" aria-label="表情">
                  <Smile size={18} />
                </button>
              </MenuTrigger>
              <MenuContent className="menu emoji-grid">
                {EMOJIS.map((emoji) => (
                  <MenuItem key={emoji} onSelect={() => app.setComposerText(`${app.session.composerText}${emoji}`)}>
                    {emoji}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <button type="button" className="icon-btn" aria-label="附件" onClick={() => app.notify('演示窗口不发送附件')}>
              <Paperclip size={18} />
            </button>
          </div>
          <button type="submit" className="send-btn" disabled={app.wechatSending} aria-busy={app.wechatSending}>
            {app.wechatSending ? <Spinner size={16} /> : '发送'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return text
  const index = text.indexOf(query)
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}
