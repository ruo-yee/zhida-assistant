/**
 * Dock poll → companion window. A visible WeChat window shows the assistant.
 * Hidden or minimized WeChat hides it, including the first poll. Quitting
 * hides it only after WeChat has been seen, so a cold start can still explain
 * that WeChat is not running. Permission prompts stay on screen.
 */
export function followWeChatVisibility(input: {
  seen: boolean
  visible: boolean
  hasBounds: boolean
  reason: string
}): { seen: boolean; show: boolean; hide: boolean } {
  if (input.hasBounds) return { seen: true, show: !input.visible, hide: false }
  if (input.reason === 'hidden' && input.visible) return { seen: input.seen, show: false, hide: true }
  if (input.seen && input.reason === 'not-running' && input.visible) {
    return { seen: true, show: false, hide: true }
  }
  return { seen: input.seen, show: false, hide: false }
}
