import { STALE_ACCESS_COPY } from '../domain/wechat/accessibilityCopy.ts'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import type { DockStatus } from './types.ts'

export interface DockBanner {
  tone: 'ok' | 'wait' | 'warn' | 'idle'
  title: string
  hint: string
  primary: 'accessibility' | 'screen' | null
}

/** One status line and at most one button. Screen Recording is not a second blocker. */
export function dockBanner(status: DockStatus | null, bridge: HostBridgeStatus | null): DockBanner | null {
  if (!status && !bridge) return null
  const darwin = (status?.platform ?? bridge?.platform) === 'darwin'
  const needScreen = darwin && Boolean(status?.needsScreenRecording)
  const needAx = darwin && Boolean(status?.needsAccessibility || bridge?.needsAccessibility)
  const stale = Boolean(status?.accessibilityStale) && needAx
  const name = status?.accessibilityName || bridge?.accessibilityName || ''
  const axTitle = stale ? STALE_ACCESS_COPY : '需要辅助功能权限才能贴到微信'
  if (status?.mode === 'docked') {
    const peer = bridge?.session?.peerName
    const sessionHint = !needAx && peer && peer !== '当前微信' ? `会话「${peer}」` : ''
    return {
      tone: 'ok',
      title: status.detail,
      hint: needAx ? axTitle : sessionHint,
      primary: needAx ? 'accessibility' : null,
    }
  }
  if (needAx) {
    return {
      tone: 'warn',
      title: axTitle,
      hint: stale ? (needScreen ? '屏幕录制可以稍后打开' : '') : name ? `打开「${name}」` : '',
      primary: 'accessibility',
    }
  }
  if (needScreen) {
    return {
      tone: 'warn',
      title: '需要屏幕录制才能看到微信窗口',
      hint: name ? `打开「${name}」` : '',
      primary: 'screen',
    }
  }
  if (status?.mode === 'searching') {
    return { tone: 'wait', title: '正在查找微信…', hint: '', primary: null }
  }
  if (status) {
    return { tone: 'warn', title: plainDockTitle(status), hint: '', primary: null }
  }
  if (bridge?.detail) return { tone: 'idle', title: shorten(bridge.detail), hint: '', primary: null }
  return null
}

function plainDockTitle(status: DockStatus) {
  if (status.detail.includes('没有运行') || status.detail.includes('未检测到微信')) return '微信没有运行'
  if (status.detail.includes('没有可见') || status.detail.includes('窗口不可见')) return '微信在运行，窗口不可见'
  if (status.detail.includes('失败')) return '暂时找不到微信窗口'
  return shorten(status.detail)
}

function shorten(text: string) {
  const line = text.split('。')[0]?.trim() || text.trim()
  return line.length > 28 ? `${line.slice(0, 28)}…` : line
}
