import { useEffect, useState } from 'react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { NEED_AX } from '../domain/wechat/composerPolicy.ts'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import type { DockStatus } from '../dock/types.ts'

function needsAccessibility(status: DockStatus | null, bridge: HostBridgeStatus | null) {
  if (status?.needsAccessibility) return true
  if (!bridge || bridge.platform !== 'darwin') return false
  if (bridge.needsAccessibility) return true
  if (bridge.axTrusted) return false
  return bridge.detail.includes(NEED_AX) || bridge.detail.includes('need-ax')
}

export function DockStatusBar() {
  const app = useCompanion()
  const [status, setStatus] = useState<DockStatus | null>(() =>
    window.zhida
      ? {
          mode: 'searching',
          platform: window.zhida.platform,
          detail: '正在查找微信窗口…',
          needsAccessibility: false,
          needsScreenRecording: false,
        }
      : null,
  )
  const [bridge, setBridge] = useState<HostBridgeStatus | null>(null)

  useEffect(() => {
    const api = window.zhida
    if (!api) return
    let alive = true
    void api.getDockStatus().then((next) => {
      if (alive) setStatus(next)
    })
    const stop = api.onDockStatus((next) => setStatus(next))
    const stopWeChat = api.wechat?.onStatus((next) => setBridge(next))
    void api.wechat?.getStatus().then((next) => {
      if (alive) setBridge(next)
    })
    return () => {
      alive = false
      stop()
      stopWeChat?.()
    }
  }, [])

  if (!status && !app.hostDetail) return null
  const darwin = (status?.platform ?? bridge?.platform ?? window.zhida?.platform) === 'darwin'
  const needAx = darwin && needsAccessibility(status, bridge)
  const needScreen = darwin && Boolean(status?.needsScreenRecording)
  const name = status?.accessibilityName || bridge?.accessibilityName || ''
  const showDocked = status?.mode === 'docked'
  const showPlainStatus = Boolean(status && !showDocked && !(status.needsAccessibility || status.needsScreenRecording))
  const showBridge = Boolean(bridge && !(darwin && bridge.needsAccessibility))

  async function openPrivacy(kind: 'accessibility' | 'screen') {
    const api = window.zhida
    if (!api) return
    const ok =
      kind === 'accessibility'
        ? await api.openAccessibilitySettings()
        : await api.openScreenRecordingSettings()
    if (!ok) app.notify(kind === 'accessibility' ? '没有打开辅助功能设置' : '没有打开屏幕录制设置')
  }

  return (
    <>
      {showDocked && status ? (
        <div className={`dock-status is-${status.mode}`} role="status">
          <span className="dock-dot" />
          <span>{status.detail}</span>
        </div>
      ) : null}
      {showPlainStatus && status ? (
        <div className={`dock-status is-${status.mode}`} role="status">
          <span className="dock-dot" />
          <span>{status.detail}</span>
        </div>
      ) : null}
      {needAx || needScreen ? (
        <div className="dock-status is-floating is-auth" role="status">
          <span className="dock-dot" />
          <span className="dock-copy">
            {needScreen ? <span>需要屏幕录制权限才能看到微信窗口</span> : null}
            {needAx ? <span>需要辅助功能权限才能贴到微信</span> : null}
            {name ? (
              <span className="dock-hint">
                {needScreen ? `屏幕录制列表打开「${name}」。` : ''}
                {needAx ? `辅助功能列表打开「${name}」。` : ''}
              </span>
            ) : null}
          </span>
          <span className="dock-actions">
            {needAx ? (
              <button type="button" className="dock-action" onClick={() => void openPrivacy('accessibility')}>
                打开辅助功能设置
              </button>
            ) : null}
            {needScreen ? (
              <button type="button" className="dock-action" onClick={() => void openPrivacy('screen')}>
                打开屏幕录制设置
              </button>
            ) : null}
            <button type="button" className="dock-action is-quiet" onClick={() => void window.zhida?.reattach()}>
              重新贴到微信
            </button>
          </span>
        </div>
      ) : null}
      {showBridge && bridge ? (
        <div className={`dock-status ${bridge.dbReady ? 'is-docked' : 'is-floating'}`} role="status">
          <span className="dock-dot" />
          <span>{bridge.detail}</span>
        </div>
      ) : null}
    </>
  )
}
