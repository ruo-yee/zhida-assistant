import { describe, expect, it } from 'vitest'
import { liveSession } from '../domain/wechat/liveSession.ts'
import {
  conversationCrop,
  mergeVisibleSession,
  parseOcrObservations,
  parseVisibleChatReport,
  pickOcrChat,
  pickVisibleTitle,
  resolveChatTitle,
} from './sessionReport.ts'

describe('parseVisibleChatReport', () => {
  it('reads the System Events window name and visible lines', () => {
    const report = parseVisibleChatReport('TITLE\t迈腾7连-3班 (322)\nLINE\t明天交作业\nLINE\t收到\n')
    expect(report).toEqual({ title: '迈腾7连-3班 (322)', lines: ['明天交作业', '收到'] })
    expect(parseVisibleChatReport('HIDDEN\n')).toBe('hidden')
    expect(parseVisibleChatReport('')).toBeNull()
  })

  it('keeps a group title when Accessibility saw no window', () => {
    const report = parseVisibleChatReport('TITLE\t迈腾7连-3班 (322)\nLINE\t明天交作业\n')
    if (report === 'hidden' || !report) throw new Error('expected a report')
    const merged = mergeVisibleSession(
      { hasWindow: false, title: '', transcript: [] as string[] },
      report,
    )
    expect(merged.hasWindow).toBe(true)
    expect(pickVisibleTitle(report.title, report.lines)).toBe('迈腾7连-3班 (322)')
    const session = liveSession({
      hasWindow: merged.hasWindow,
      title: merged.title,
      transcript: merged.transcript,
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('迈腾7连-3班')
    expect(session?.chatType).toBe('group')
    expect(session?.messages.map((message) => message.text)).toEqual(['明天交作业'])
  })

  it('does not treat a visible window as missing when the title is only in the text', () => {
    const merged = mergeVisibleSession(
      { hasWindow: false, title: '', transcript: [] as string[] },
      { title: '微信', lines: ['迈腾7连-3班 (322)', '在吗'] },
    )
    expect(merged.title).toBe('迈腾7连-3班 (322)')
    expect(merged.transcript).toEqual(['在吗'])
  })
})

describe('resolveChatTitle', () => {
  it('keeps the member count and prefers a real window title', () => {
    expect(
      resolveChatTitle({
        windowTitle: '项目组 (12)',
        headerTitle: '别的会话',
        visibleWindowTitle: '微信',
      }),
    ).toBe('项目组 (12)')
  })

  it('treats 微信 as the app name and uses the header, then the selected row', () => {
    expect(
      resolveChatTitle({
        windowTitle: '微信',
        headerTitle: '迈腾7连-3班 (322)',
        selectedTitle: '其他',
      }),
    ).toBe('迈腾7连-3班 (322)')
    expect(
      resolveChatTitle({
        windowTitle: '微信',
        headerTitle: '(322)',
        selectedTitle: '迈腾7连-3班 (322)',
      }),
    ).toBe('迈腾7连-3班 (322)')
  })

  it('uses the System Events name when Accessibility has no chat title', () => {
    expect(
      resolveChatTitle({
        windowTitle: '',
        headerTitle: '',
        selectedTitle: '12:30',
        visibleWindowTitle: '迈腾7连-3班 (322)',
      }),
    ).toBe('迈腾7连-3班 (322)')
    expect(resolveChatTitle({ windowTitle: '图片预览', headerTitle: '322', selectedTitle: '微信' })).toBe('')
  })

  it('does not let an app-name Accessibility title replace the visible group', () => {
    const merged = mergeVisibleSession(
      { hasWindow: false, title: '微信', transcript: [] as string[] },
      { title: '迈腾7连-3班 (322)', lines: ['明天交作业'] },
    )
    expect(merged.hasWindow).toBe(true)
    expect(merged.title).toBe('迈腾7连-3班 (322)')
    const session = liveSession({
      hasWindow: true,
      title: merged.title,
      transcript: merged.transcript,
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('迈腾7连-3班')
    expect(session?.chatType).toBe('group')
  })

  it('uses OCR only after the window title, header, and selected row are empty', () => {
    expect(
      resolveChatTitle({
        windowTitle: '微信',
        headerTitle: '',
        selectedTitle: '',
        visibleWindowTitle: '微信',
        ocrTitle: '迈腾7连-3班 (322)',
      }),
    ).toBe('迈腾7连-3班 (322)')
    expect(resolveChatTitle({ windowTitle: '项目组 (4)', ocrTitle: '别的' })).toBe('项目组 (4)')
  })
})

describe('pickOcrChat', () => {
  it('reads the group header above the messages', () => {
    const seen = pickOcrChat(
      parseOcrObservations(
        'LINE\t0.04\t迈腾7连—3班 (322)\nLINE\t0.08\t11条新消息\nLINE\t0.40\t好的\nLINE\t0.62\t宋哥，感觉我能给多少钱\n',
      ),
    )
    expect(seen.title).toBe('迈腾7连—3班 (322)')
    expect(seen.lines).toEqual(['好的', '宋哥，感觉我能给多少钱'])
    const session = liveSession({
      hasWindow: true,
      title: seen.title,
      transcript: seen.lines,
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('迈腾7连—3班')
    expect(session?.chatType).toBe('group')
  })

  it('crops the conversation pane inside the docked window', () => {
    const crop = conversationCrop({ x: 0, y: 111, width: 915, height: 693 })
    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(111)
    expect(crop.x + crop.width).toBeLessThanOrEqual(915)
    expect(crop.y + crop.height).toBeLessThanOrEqual(111 + 693)
  })
})
