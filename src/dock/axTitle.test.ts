import { describe, expect, it } from 'vitest'
import { liveSession } from '../domain/wechat/liveSession.ts'
import { chatTitleFrom, framesNear, headerTitleSearch, pickChatElement, selectedRowTitleFrom, type AxRead } from './axTitle.ts'

interface Node {
  role?: string
  id?: string
  value?: string
  title?: string
  selected?: boolean
  rows?: Node[]
  children?: Node[]
}

function reader(): AxRead {
  return (element, attribute) => {
    const node = element as Node
    if (attribute === 'AXRole') return node.role ?? ''
    if (attribute === 'AXIdentifier') return node.id ?? ''
    if (attribute === 'AXValue') return node.value ?? ''
    if (attribute === 'AXTitle') return node.title ?? ''
    if (attribute === 'AXDescription') return ''
    if (attribute === 'AXSelected') return node.selected === true
    if (attribute === 'AXSelectedRows') return node.rows ?? null
    if (attribute === 'AXChildren') return node.children ?? []
    return null
  }
}

describe('chat title ladder', () => {
  it('keeps the member count on the header so the session is a group', () => {
    const header: Node = {
      role: 'AXStaticText',
      id: 'big_title_line_h_view',
      value: '迈腾7连-3班 (322)',
    }
    const window: Node = { role: 'AXWindow', title: '微信', children: [header] }
    const title = chatTitleFrom('微信', window, reader())
    expect(title).toBe('迈腾7连-3班 (322)')
    const session = liveSession({ hasWindow: true, title, transcript: [], composerText: '', db: null })
    expect(session?.chatType).toBe('group')
    expect(session?.peerName).toBe('迈腾7连-3班')
  })

  it('reads AXTitle only when the header value is empty', () => {
    const header: Node = {
      role: 'AXStaticText',
      id: 'big_title_line_h_view',
      value: '',
      title: '迈腾7连—3班 (18)',
    }
    const window: Node = { role: 'AXWindow', children: [{ role: 'AXGroup', children: [header] }] }
    expect(headerTitleSearch(window, reader())).toEqual({ found: true, title: '迈腾7连—3班 (18)' })
  })

  it('does not treat a nearby static text as the header', () => {
    const window: Node = {
      role: 'AXWindow',
      children: [{ role: 'AXStaticText', id: 'title_view', value: '别人的标题 (9)' }],
    }
    expect(headerTitleSearch(window, reader()).found).toBe(false)
  })

  it('uses the selected outline row when the header is missing', () => {
    const row: Node = {
      role: 'AXOutlineRow',
      children: [{ role: 'AXStaticText', value: '迈腾7连-3班 (322)' }],
    }
    const outline: Node = { role: 'AXOutline', rows: [row], children: [] }
    const window: Node = { role: 'AXWindow', children: [outline] }
    expect(selectedRowTitleFrom(window, reader())).toBe('迈腾7连-3班 (322)')
    expect(chatTitleFrom('', window, reader())).toBe('迈腾7连-3班 (322)')
  })

  it('drops the app name, a clock, and a bare count', () => {
    const row: Node = { role: 'AXRow', selected: true, value: '微信', children: [{ role: 'AXStaticText', value: '12:30' }] }
    const window: Node = { role: 'AXWindow', children: [row] }
    expect(selectedRowTitleFrom(window, reader())).toBe('')
    expect(chatTitleFrom('图片预览', window, reader())).toBe('')
  })

  it('picks the window that matches the on-screen chat frame', () => {
    const emoji = { id: 'emoji', x: 400, y: 200, width: 500, height: 400, minimized: false }
    const chat = { id: 'chat', x: 0, y: 111, width: 915, height: 693, minimized: false }
    const mini = { id: 'mini', x: 0, y: 111, width: 915, height: 693, minimized: true }
    const picked = pickChatElement([mini, emoji, chat], { x: 1, y: 112, width: 915, height: 693 }, (item) => item, (item) => item.minimized)
    expect(picked?.id).toBe('chat')
    expect(pickChatElement([mini], null, (item) => item, (item) => item.minimized)).toBeNull()
    expect(pickChatElement([mini, chat], null, (item) => item, (item) => item.minimized)).toBeNull()
    expect(pickChatElement([chat, emoji], null, (item) => item, (item) => item.minimized)?.id).toBe('chat')
  })

  it('matches a chat frame within four points', () => {
    expect(framesNear({ x: 0, y: 111, width: 915, height: 693 }, { x: 2, y: 113, width: 915, height: 691 })).toBe(true)
    expect(framesNear({ x: 0, y: 111, width: 915, height: 693 }, { x: 40, y: 111, width: 915, height: 693 })).toBe(false)
  })
})
