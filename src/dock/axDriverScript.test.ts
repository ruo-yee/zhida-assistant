import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('WeChat session reader when CoreGraphics is empty', () => {
  const source = readFileSync('electron/wechat/axDriver.ts', 'utf8')

  it('imports CoreGraphics and falls back to the largest Accessibility window', () => {
    expect(source).toContain("ObjC.import('CoreGraphics')")
    const main = source.slice(source.indexOf('function mainWindow'), source.indexOf('function cgOwnedWindow'))
    expect(main).toContain('largestAxWindow')
    expect(main).toContain('AXWindows')
    expect(main.indexOf('cgOwnedWindow')).toBeLessThan(main.indexOf('largestAxWindow(windows)'))
    const pick = source.slice(source.indexOf('function largestAxWindow'), source.indexOf('function asWindows'))
    expect(pick).toContain('size.w < 240')
    expect(pick).toContain('size.h < 240')
    expect(pick).toContain('axSize')
  })

  it('still trusts the Electron host and reconciles a failed Accessibility call', () => {
    expect(source).toContain('electronAccessibilityTrusted')
    expect(source).toContain('reconcileAxView(view, hostTrusted, workspaceRunning)')
    expect(source).toContain('hostTrusted')
  })
})
