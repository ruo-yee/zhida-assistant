import { NEED_AX } from './composerPolicy.ts'

/** Packaged DMG registers as 智答助手. The unpackaged Electron binary shows as Electron. */
export function accessibilityClientName(packaged: boolean) {
  return packaged ? '智答助手' : 'Electron'
}

/** Toggle looks granted, but this build's signature is not the one TCC recorded. */
export const STALE_ACCESS_COPY = '请关掉再打开「智答助手」权限并完全退出后重开（更新后需重新授权）'

export function needAccessibilityReason(appName: string) {
  return `${NEED_AX}。在列表中打开「${appName}」。`
}

export function accessibilityDetail(packaged: boolean) {
  if (packaged) return STALE_ACCESS_COPY
  return needAccessibilityReason(accessibilityClientName(false))
}
