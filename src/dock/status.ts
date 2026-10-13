import type { DockReason, DockSide, DockStatus } from './types.ts'

export function describeDock(input: {
  platform: string
  reason: DockReason
  side?: DockSide
}): DockStatus {
  if (input.reason === 'ok' && input.side === 'left') {
    return { mode: 'docked', platform: input.platform, side: 'left', detail: '已贴在微信左侧（右侧空间不够）' }
  }
  if (input.reason === 'ok') {
    return { mode: 'docked', platform: input.platform, side: 'right', detail: '已贴在微信右侧' }
  }
  if (input.reason === 'permission') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '需要辅助功能权限才能贴住微信。授权后可在菜单里重新贴上。',
    }
  }
  if (input.reason === 'unsupported-platform') {
    return { mode: 'floating', platform: input.platform, detail: '此环境不附着微信，助手以悬浮窗运行。' }
  }
  if (input.reason === 'error') {
    return { mode: 'floating', platform: input.platform, detail: '查找微信窗口失败，助手以悬浮窗运行。' }
  }
  return { mode: 'floating', platform: input.platform, detail: '未检测到微信，悬浮窗运行。打开微信后会自动贴到右侧。' }
}
