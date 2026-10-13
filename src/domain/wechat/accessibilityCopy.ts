import { NEED_AX } from './composerPolicy.ts'

/** Packaged DMG registers as 智答助手. The unpackaged Electron binary shows as Electron. */
export function accessibilityClientName(packaged: boolean) {
  return packaged ? '智答助手' : 'Electron'
}

export function needAccessibilityReason(appName: string) {
  return `${NEED_AX}。在列表中打开「${appName}」。`
}
