import { useEffect, useState } from 'react'
import type { DockStatus } from '../dock/types.ts'

export function DockStatusBar() {
  const [status, setStatus] = useState<DockStatus | null>(() =>
    window.zhida
      ? { mode: 'searching', platform: window.zhida.platform, detail: '正在查找微信窗口…' }
      : null,
  )

  useEffect(() => {
    const api = window.zhida
    if (!api) return
    let alive = true
    void api.getDockStatus().then((next) => {
      if (alive) setStatus(next)
    })
    const stop = api.onDockStatus((next) => setStatus(next))
    return () => {
      alive = false
      stop()
    }
  }, [])

  if (!status) return null
  return (
    <div className={`dock-status is-${status.mode}`} role="status">
      <span className="dock-dot" />
      <span>{status.detail}</span>
    </div>
  )
}
