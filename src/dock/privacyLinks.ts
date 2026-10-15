export type PrivacyPane = 'accessibility' | 'screen'

/** Documented deep link. Honored by System Preferences on macOS 12 and earlier. */
export const ACCESSIBILITY_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
export const SCREEN_RECORDING_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

/** macOS 13+ System Settings pane. The legacy anchor often opens Privacy without the list. */
export const ACCESSIBILITY_URL_VENTURA =
  'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility'
export const SCREEN_RECORDING_URL_VENTURA =
  'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture'

/**
 * Classic link first where it still selects the list (Darwin 21 / macOS 12 and earlier).
 * On macOS 13+ (Darwin 22) that anchor is ignored, so the settings-extension URL is
 * attempted first and the classic link stays as the fallback if open fails.
 */
export function privacyUrlAttempts(kind: PrivacyPane, darwinMajor: number) {
  const classic = kind === 'accessibility' ? ACCESSIBILITY_URL : SCREEN_RECORDING_URL
  const modern = kind === 'accessibility' ? ACCESSIBILITY_URL_VENTURA : SCREEN_RECORDING_URL_VENTURA
  if (darwinMajor >= 22) return [modern, classic]
  return [classic, modern]
}
