import { useEffect, useState } from 'react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import { dockBanner } from '../dock/banner.ts'
import type { DockStatus } from '../dock/types.ts'

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

  const banner = dockBanner(status, bridge)
  if (!banner) return null

  async function openPrivacy(kind: 'accessibility' | 'screen') {
    const api = window.zhida
    if (!api) return
    const ok =
      kind === 'accessibility' ? await api.openAccessibilitySettings() : await api.openScreenRecordingSettings()
    if (!ok) app.notify(kind === 'accessibility' ? '没有打开辅助功能设置' : '没有打开屏幕录制设置')
  }

  return (
    <div className={`dock-status is-${banner.tone}`} role="status">
      <span className="dock-dot" />
      <span className="dock-copy">
        <span>{banner.title}</span>
        {banner.hint ? <span className="dock-hint">{banner.hint}</span> : null}
      </span>
      {banner.primary ? (
        <button type="button" className="dock-action" onClick={() => void openPrivacy(banner.primary!)}>
          {banner.primary === 'screen' ? '打开屏幕录制设置' : '打开辅助功能设置'}
        </button>
      ) : null}
    </div>
  )
}
