import { describe, expect, it } from 'vitest'
import { darwinWeChatWindowScript } from './darwinWindowScript.ts'
import {
  electronBoundsFromAppKit,
  electronBoundsFromQuartz,
  parseWeChatSnapshot,
  selectWeChatWindow,
  type ListedWindow,
  type WeChatWindowSnapshot,
} from './wechatWindow.ts'

function win(partial: Partial<ListedWindow> & Pick<ListedWindow, 'pid' | 'width' | 'height'>): ListedWindow {
  return {
    layer: 0,
    x: 0,
    y: 0,
    title: '',
    owner: '',
    id: 1,
    ...partial,
  }
}

function snapshot(partial: Partial<WeChatWindowSnapshot> = {}): WeChatWindowSnapshot {
  return {
    pids: [],
    names: [],
    selfPid: 9,
    windows: [],
    axTrusted: null,
    axBounds: null,
    appHidden: false,
    ...partial,
  }
}

describe('selectWeChatWindow', () => {
  it('docks to the bundle PID even when the title and owner name are blank', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        names: ['微信'],
        windows: [
          win({ pid: 11, width: 1728, height: 990, title: '微信读书', owner: '微信读书', id: 2 }),
          win({ pid: 10, x: 100, y: 80, width: 800, height: 600, title: '', owner: '', id: 1 }),
        ],
      }),
    )
    expect(found.reason).toBe('ok')
    expect(found.bounds).toEqual({ x: 100, y: 80, width: 800, height: 600, title: '微信' })
  })

  it('keeps Quartz top-left Y and flips only an AppKit frame', () => {
    const quartz = electronBoundsFromQuartz({ x: 100, y: 80, width: 800, height: 700, title: '微信' })
    expect(quartz.y).toBe(80)
    const appKit = electronBoundsFromAppKit({ x: 100, y: 300, width: 800, height: 700, title: '微信' }, 1080)
    expect(appKit.y).toBe(80)
  })

  it('picks the largest layer-0 window and ignores a bigger overlay', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        windows: [
          win({ pid: 10, width: 700, height: 500, id: 1 }),
          win({ pid: 10, layer: 3, width: 2000, height: 2000, id: 2 }),
          win({ pid: 10, width: 900, height: 700, id: 3 }),
          win({ pid: 10, width: 100, height: 100, id: 4 }),
        ],
      }),
    )
    expect(found.bounds?.width).toBe(900)
    expect(found.bounds?.height).toBe(700)
  })

  it('accepts an exact Weixin owner when the PID list missed it', () => {
    const found = selectWeChatWindow(
      snapshot({ windows: [win({ pid: 4, owner: 'Weixin', width: 900, height: 700 })] }),
    )
    expect(found.reason).toBe('ok')
    expect(
      selectWeChatWindow(snapshot({ windows: [win({ pid: 8, owner: '微信输入法', width: 900, height: 700 })] })).reason,
    ).toBe('not-running')
  })

  it('asks for screen recording without an Accessibility prompt when the app is already trusted', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        selfPid: 9,
        axTrusted: true,
        windows: [win({ pid: 9, width: 440, height: 780, owner: '智答助手' })],
      }),
    )
    expect(found.reason).toBe('screen-recording')
    expect(found.needsAccessibility).toBe(false)
  })

  it('asks for screen recording when WeChat is running but no other windows are visible', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        selfPid: 9,
        axTrusted: false,
        windows: [win({ pid: 9, width: 440, height: 780, owner: '智答助手' })],
      }),
    )
    expect(found.reason).toBe('screen-recording')
    expect(found.needsAccessibility).toBe(true)
  })

  it('uses Accessibility bounds when the window list missed WeChat', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        axTrusted: true,
        axBounds: { x: 40, y: 60, width: 880, height: 640 },
        windows: [win({ pid: 3, width: 500, height: 400, owner: 'Safari' })],
      }),
    )
    expect(found).toEqual({
      bounds: { x: 40, y: 60, width: 880, height: 640, title: '微信' },
      reason: 'ok',
    })
  })

  it('reports a hidden main window when other apps are visible', () => {
    const found = selectWeChatWindow(
      snapshot({
        pids: [10],
        axTrusted: true,
        windows: [win({ pid: 3, width: 500, height: 400, owner: 'Safari' })],
      }),
    )
    expect(found.reason).toBe('hidden')
  })

  it('parses a CG snapshot line', () => {
    const parsed = parseWeChatSnapshot('noise\n{"pids":[10],"names":["微信"],"selfPid":9,"windows":[],"axTrusted":false,"axBounds":null}\n')
    expect(parsed?.pids).toEqual([10])
    expect(parsed?.axTrusted).toBe(false)
  })
})

describe('darwinWeChatWindowScript', () => {
  it('looks up the WeChat bundle and does not prompt on the poll', () => {
    const script = darwinWeChatWindowScript()
    expect(script).toContain('com.tencent.xinWeChat')
    expect(script).toContain('AXIsProcessTrusted')
    expect(script).toContain('appHidden')
    expect(script).toContain('function isAppHidden')
    expect(script).not.toContain('AXTrustedCheckOptionPrompt')
  })
})
