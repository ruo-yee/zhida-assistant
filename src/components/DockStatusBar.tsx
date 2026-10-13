import { useEffect, useState } from 'react'
import type { DockStatus } from '../dock/types.ts'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import { useCompanion } from '../app/CompanionProvider.tsx'

export function DockStatusBar() {
  const app = useCompanion()
  const [status, setStatus] = useState<DockStatus | null>(() =>
    window.zhida
      ? { mode: 'searching', platform: window.zhida.platform, detail: '正在查找微信窗口…' }
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
  return (
    <>
      {status ? (
        <div className={`dock-status is-${status.mode}`} role="status">
          <span className="dock-dot" />
          <span>{status.detail}</span>
        </div>
      ) : null}
      {bridge ? (
        <div className={`dock-status ${bridge.dbReady ? 'is-docked' : 'is-floating'}`} role="status">
          <span className="dock-dot" />
          <span>{bridge.detail}</span>
        </div>
      ) : null}
    </>
  )
}
