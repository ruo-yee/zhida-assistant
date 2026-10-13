import { describe, expect, it } from 'vitest'
import { STALE_ACCESS_COPY } from '../domain/wechat/accessibilityCopy.ts'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import { dockBanner } from './banner.ts'
import type { DockStatus } from './types.ts'

function dock(patch: Partial<DockStatus> = {}): DockStatus {
  return {
    mode: 'floating',
    platform: 'darwin',
    detail: '未检测到微信，悬浮窗运行。打开微信后会自动贴到右侧。',
    needsAccessibility: false,
    needsScreenRecording: false,
    accessibilityName: '智答助手',
    ...patch,
  }
}

const bridge: HostBridgeStatus = {
  platform: 'darwin',
  available: false,
  axTrusted: false,
  wechatRunning: true,
  dbReady: false,
  needsAccessibility: true,
  accessibilityName: '智答助手',
  detail: '需要辅助功能权限才能贴到微信',
  session: null,
}

describe('dockBanner', () => {
  it('shows one re-authorize action when the packaged trust check is stale', () => {
    const banner = dockBanner(
      dock({
        needsAccessibility: true,
        needsScreenRecording: true,
        accessibilityStale: true,
        detail: '需要屏幕录制权限才能看到微信窗口',
      }),
      bridge,
    )
    expect(banner).toEqual({
      tone: 'warn',
      title: STALE_ACCESS_COPY,
      hint: '屏幕录制可以稍后打开',
      primary: 'accessibility',
    })
    expect(banner?.title).not.toContain('需要屏幕录制')
  })

  it('asks only for screen recording when Accessibility is already trusted', () => {
    expect(
      dockBanner(dock({ needsScreenRecording: true, detail: '需要屏幕录制权限才能看到微信窗口' }), null),
    ).toMatchObject({ primary: 'screen', title: '需要屏幕录制才能看到微信窗口' })
  })

  it('keeps a successful dock on one line, with the re-authorize hint only if insert still needs it', () => {
    expect(dockBanner(dock({ mode: 'docked', detail: '已贴在微信右侧', needsScreenRecording: true }), null)).toEqual({
      tone: 'ok',
      title: '已贴在微信右侧',
      hint: '',
      primary: null,
    })
    expect(
      dockBanner(dock({ mode: 'docked', detail: '已贴在微信右侧', accessibilityStale: true }), bridge),
    ).toMatchObject({ tone: 'ok', title: '已贴在微信右侧', hint: STALE_ACCESS_COPY, primary: 'accessibility' })
  })

  it('shortens a missing WeChat window', () => {
    expect(dockBanner(dock(), null)?.title).toBe('微信没有运行')
    expect(dockBanner(null, null)).toBeNull()
  })
})
