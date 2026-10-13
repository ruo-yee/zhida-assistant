import { NEED_AX } from './composerPolicy.ts'

/** Packaged DMG registers as 智答助手. The unpackaged Electron binary shows as Electron. */
export function accessibilityClientName(packaged: boolean) {
  return packaged ? '智答助手' : 'Electron'
}

/** Toggle looks granted, but this build's signature is not the one TCC recorded. */
export const STALE_ACCESS_COPY = '请关掉再打开「智答助手」权限并完全退出后重开（更新后需重新授权）'

/** Unsigned or ad-hoc builds are stopped by Gatekeeper before Accessibility can apply. */
export const GATEKEEPER_NOTE =
  '若系统提示无法验证开发者，打开「系统设置 → 隐私与安全性」，点「仍要打开」。未签名或每次构建哈希都变的包会这样；用稳定身份签名后一般不再出现。'

export function needAccessibilityReason(appName: string) {
  return `${NEED_AX}。在列表中打开「${appName}」。`
}

export function accessibilityDetail(packaged: boolean) {
  if (packaged) return STALE_ACCESS_COPY
  return needAccessibilityReason(accessibilityClientName(false))
}
