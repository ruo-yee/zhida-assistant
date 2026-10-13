import type { DockReason, DockSide, DockStatus } from './types.ts'

export function describeDock(input: {
  platform: string
  reason: DockReason
  side?: DockSide
  needsAccessibility?: boolean
}): DockStatus {
  const needsAccessibility = input.reason === 'permission' || Boolean(input.needsAccessibility)
  const needsScreenRecording = input.reason === 'screen-recording'
  if (input.reason === 'ok' && input.side === 'left') {
    return {
      mode: 'docked',
      platform: input.platform,
      side: 'left',
      detail: '已贴在微信左侧（右侧空间不够）',
      needsAccessibility,
      needsScreenRecording,
    }
  }
  if (input.reason === 'ok') {
    return {
      mode: 'docked',
      platform: input.platform,
      side: 'right',
      detail: '已贴在微信右侧',
      needsAccessibility,
      needsScreenRecording,
    }
  }
  if (input.reason === 'permission') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '需要辅助功能权限才能贴到微信',
      needsAccessibility: true,
      needsScreenRecording: false,
    }
  }
  if (input.reason === 'screen-recording') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '需要屏幕录制权限才能看到微信窗口',
      needsAccessibility,
      needsScreenRecording: true,
    }
  }
  if (input.reason === 'hidden') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '微信已在运行，但没有可见的主窗口。打开后会自动贴上。',
      needsAccessibility,
      needsScreenRecording: false,
    }
  }
  if (input.reason === 'unsupported-platform') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '此环境不附着微信，助手以悬浮窗运行。',
      needsAccessibility: false,
      needsScreenRecording: false,
    }
  }
  if (input.reason === 'error') {
    return {
      mode: 'floating',
      platform: input.platform,
      detail: '查找微信窗口失败，助手以悬浮窗运行。',
      needsAccessibility: false,
      needsScreenRecording: false,
    }
  }
  return {
    mode: 'floating',
    platform: input.platform,
    detail: '未检测到微信，悬浮窗运行。打开微信后会自动贴到右侧。',
    needsAccessibility: false,
    needsScreenRecording: false,
  }
}
