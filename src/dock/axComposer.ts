/**
 * Ports of `wechat_send._composer_point` and `_find_input_box`.
 * The click is a top-left point. CoreGraphics mouse events use that same
 * space in the reference; it is not flipped, and it is not a fraction of
 * the window height.
 */

export const MIN_INPUT_AREA = 10000
export const MAX_INPUT_NODES = 3000

export interface ComposerFrame {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Chat pane, bottom band: right of the sidebar, below the toolbar icons,
 * left of Send. `x + width * 0.62`, `y + height - 72`.
 */
export function composerPoint(frame: ComposerFrame): { x: number; y: number } {
  return {
    x: frame.x + frame.width * 0.62,
    y: frame.y + frame.height - 72,
  }
}

export interface TextAreaShape {
  role: string
  width: number
  height: number
}

/** Largest AXTextArea whose area is at least 10000. Smaller boxes are not the composer. */
export function pickLargestTextArea<T>(items: T[], shapeOf: (item: T) => TextAreaShape): T | null {
  let best: T | null = null
  let bestArea = 0
  for (const item of items) {
    const shape = shapeOf(item)
    if (shape.role !== 'AXTextArea') continue
    const area = shape.width * shape.height
    if (area > bestArea) {
      best = item
      bestArea = area
    }
  }
  if (best == null || bestArea < MIN_INPUT_AREA) return null
  return best
}
