/** Packaged DMG registers as 智答助手. The unpackaged Electron binary shows as Electron. */
export function accessibilityClientName(packaged: boolean) {
  return packaged ? '智答助手' : 'Electron'
}

/** Toggle looks granted, but this build's signature is not the one TCC recorded. */
export const STALE_ACCESS_COPY = '请关掉再打开「智答助手」权限并完全退出后重开（更新后需重新授权）'

/** macOS will not flip the Accessibility switch for us. The user drags the app in. */
export const CANNOT_AUTO_GRANT = 'macOS 不能自动授权'

export function accessibilityGrantGuide(appName: string) {
  const name = appName.trim() || '智答助手'
  return {
    title: CANNOT_AUTO_GRANT,
    hint: `把「${name}」拖进辅助功能列表，并打开开关。打开后会自动贴回微信。`,
  }
}

export function staleGrantHint(appName: string) {
  const name = appName.trim() || '智答助手'
  return `若列表里没有「${name}」，先拖进去再打开开关。若开关已开仍无效，关掉再打开，完全退出后重开。`
}

/** Unsigned or ad-hoc builds are stopped by Gatekeeper before Accessibility can apply. */
export const GATEKEEPER_NOTE =
  '若系统提示无法验证开发者，打开「系统设置 → 隐私与安全性」，点「仍要打开」。未签名或每次构建哈希都变的包会这样；用稳定身份签名后一般不再出现。'

export function needAccessibilityReason(appName: string) {
  return accessibilityGrantGuide(appName).hint
}

export function accessibilityDetail(packaged: boolean) {
  const guide = accessibilityGrantGuide(accessibilityClientName(packaged))
  if (packaged) return `${STALE_ACCESS_COPY} ${guide.hint}`
  return guide.hint
}

/** True only on the poll where Accessibility flips from denied to granted. */
export function redockAfterGrant(wasTrusted: boolean, trusted: boolean) {
  return !wasTrusted && trusted
}
