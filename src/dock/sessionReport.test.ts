import { describe, expect, it } from 'vitest'
import { liveSession } from '../domain/wechat/liveSession.ts'
import {
  conversationCrop,
  mergeVisibleSession,
  parseOcrObservations,
  parseVisibleChatReport,
  pickOcrChat,
  pickPositionedTitle,
  pickVisibleTitle,
  resolveChatTitle,
} from './sessionReport.ts'

describe('parseVisibleChatReport', () => {
  it('reads the System Events window name and visible lines', () => {
    const report = parseVisibleChatReport('TITLE\t迈腾7连-3班 (322)\nLINE\t明天交作业\nLINE\t收到\n')
    expect(report).toEqual({
      title: '迈腾7连-3班 (322)',
      lines: ['明天交作业', '收到'],
      bounds: null,
      placed: [],
    })
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

  it('uses only the top text row, the way the reference title row does', () => {
    const seen = pickOcrChat(
      parseOcrObservations('LINE\t0.04\t0.20\t0.16\t通知栏\nLINE\t0.60\t0.10\t0.18\t另一群 (9)\n'),
    )
    expect(seen.title).toBe('通知栏')
  })

  it('keeps a private Latin name when the window is only called 微信', () => {
    expect(pickVisibleTitle('微信', ['bulaji', '在吗', '明天交作业'])).toBe('bulaji')
    expect(pickVisibleTitle('微信', ['在吗', '明天交作业'])).toBe('')
    expect(pickVisibleTitle('微信', ['b u l a j i'])).toBe('bulaji')
  })

  it('reads the title band from System Events positions when AX has no window', () => {
    const report = parseVisibleChatReport(
      'TITLE\t微信\nBOUNDS\t0\t111\t915\t693\nLINE\t在吗\nPOS\t120\t400\tbulaji\nPOS\t400\t400\t在吗\nPOS\t140\t80\t其他会话\n',
    )
    if (report === 'hidden' || !report) throw new Error('expected a report')
    expect(pickPositionedTitle(report.bounds ?? null, report.placed ?? [])).toBe('bulaji')
    const merged = mergeVisibleSession({ hasWindow: false, title: '', transcript: [] as string[] }, report)
    expect(merged.title).toBe('bulaji')
    const session = liveSession({
      hasWindow: true,
      title: merged.title,
      transcript: merged.transcript,
      composerText: '',
      db: null,
    })
    expect(session?.peerName).toBe('bulaji')
    expect(session?.chatType).toBe('private')
  })

  it('joins a letter-spaced OCR header', () => {
    const seen = pickOcrChat(parseOcrObservations('LINE\t0.02\t0.40\t0.12\tb u l a j i\nLINE\t0.40\t0.20\t0.10\t在吗\n'))
    expect(seen.title).toBe('bulaji')
  })

  it('crops the title band the way the reference title crop does', () => {
    const crop = conversationCrop({ x: 0, y: 111, width: 915, height: 693 })
    expect(crop).toEqual({ x: 312, y: 115, width: 507, height: 72 })
  })
})
