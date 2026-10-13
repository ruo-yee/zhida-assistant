/**
 * After the assistant has seen WeChat once, hide it when WeChat hides or
 * quits, and show it again when a dockable window returns. Permission
 * problems stay on screen so the user can grant them.
 */
export function followWeChatVisibility(input: {
  seen: boolean
  visible: boolean
  hasBounds: boolean
  reason: string
}): { seen: boolean; show: boolean; hide: boolean } {
  if (input.hasBounds) return { seen: true, show: !input.visible, hide: false }
  const away = input.reason === 'hidden' || input.reason === 'not-running'
  if (input.seen && away && input.visible) return { seen: true, show: false, hide: true }
  return { seen: input.seen, show: false, hide: false }
}
