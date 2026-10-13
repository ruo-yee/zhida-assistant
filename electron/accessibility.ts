import { systemPreferences } from 'electron'

let prompted = false

/**
 * Shows the system Accessibility dialog once per process.
 * Electron maps `prompt === true` to AXIsProcessTrustedWithOptions with
 * kAXTrustedCheckOptionPrompt, on this app (智答助手 or Electron), not osascript.
 * Polls must keep calling the unprompted check.
 */
export function promptForAccessibilityOnce() {
  if (process.platform !== 'darwin' || prompted) return
  prompted = true
  try {
    systemPreferences.isTrustedAccessibilityClient(true)
  } catch {
    prompted = false
  }
}

export function electronAccessibilityTrusted() {
  if (process.platform !== 'darwin') return false
  try {
    return systemPreferences.isTrustedAccessibilityClient(false)
  } catch {
    return false
  }
}
