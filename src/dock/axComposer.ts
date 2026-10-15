/**
 * Ports of the working Mac companion:
 * `title_ocr.fallback_pane_left` and `wechat_send._composer_point` /
 * the largest `AXTextArea` inside the chat window.
 * Insert never presses Return.
 */

/** WeChat 4, left to right: icon rail, then the chat list. */
export const ICON_RAIL_POINTS = 68
export const DEFAULT_CHAT_LIST_POINTS = 280

/**
 * Points from the window's left edge to the conversation pane.
 * Same rule as `title_ocr.fallback_pane_left`.
 */
export function fallbackPaneLeft(windowWidth: number) {
  const edge = ICON_RAIL_POINTS + DEFAULT_CHAT_LIST_POINTS
  return Math.min(edge, Math.max(windowWidth - 180, 0))
}

/** Empty composer row, measured up from the window bottom. Not a fraction of the height. */
export const COMPOSER_BOTTOM_INSET = 40
/** Stay left of the send control. */
export const SEND_RESERVE_POINTS = 88

export interface ComposerFrame {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Click target for the paste fallback. Top-left global points.
 * Port of `wechat_send._composer_point`: the conversation pane's bottom
 * band, left of Send. A fraction of the whole window (62% across, 16% up)
 * lands in the message list on a tall window and opens videos.
 */
export function composerPoint(frame: ComposerFrame): { x: number; y: number } | null {
  if (frame.width < 240 || frame.height < 240) return null
  const paneLeft = fallbackPaneLeft(frame.width)
  const paneRight = frame.width - SEND_RESERVE_POINTS
  if (paneRight - paneLeft < 80) return null
  const x = frame.x + (paneLeft + paneRight) / 2
  const y = frame.y + frame.height - COMPOSER_BOTTOM_INSET
  const fromBottom = frame.y + frame.height - y
  if (fromBottom < 24 || fromBottom > 64) return null
  if (x < frame.x + paneLeft || x > frame.x + paneRight) return null
  return { x, y }
}

/**
 * CGEvent mouse positions use the bottom-left of the primary display.
 * `topLeft` is the Quartz / Electron point (Y grows downward).
 */
export function mouseEventPoint(topLeft: { x: number; y: number }, primaryHeight: number): { x: number; y: number } | null {
  if (!(primaryHeight > 0) || !(topLeft.x > 0)) return null
  const y = primaryHeight - topLeft.y
  if (!(y > 0)) return null
  return { x: topLeft.x, y }
}

export interface TextAreaShape {
  role: string
  width: number
  height: number
  x?: number
  y?: number
}

/**
 * Largest `AXTextArea` inside the chat window from the window server.
 * Port of the accessibility insert pick. A search field is not a text area.
 * Text outside that window is not the composer.
 */
export function pickLargestTextArea<T>(
  items: T[],
  shapeOf: (item: T) => TextAreaShape,
  window: ComposerFrame | null,
): T | null {
  const areas = items.filter((item) => shapeOf(item).role === 'AXTextArea')
  const inside = window ? areas.filter((item) => areaInside(shapeOf(item), window)) : areas.filter((item) => shapeOf(item).width >= 80 && shapeOf(item).height >= 16)
  if (inside.length > 0) return largest(inside, shapeOf)
  const bare = areas.filter((item) => shapeOf(item).x == null && shapeOf(item).y == null)
  if (bare.length === 1) return bare[0] ?? null
  return null
}

function areaInside(shape: TextAreaShape, window: ComposerFrame) {
  if (shape.x == null || shape.y == null || shape.width < 80 || shape.height < 16) return false
  const centerX = shape.x + shape.width / 2
  const centerY = shape.y + shape.height / 2
  return centerX >= window.x && centerX <= window.x + window.width && centerY >= window.y && centerY <= window.y + window.height
}

function largest<T>(items: T[], shapeOf: (item: T) => TextAreaShape) {
  return [...items].sort((a, b) => area(shapeOf(b)) - area(shapeOf(a)))[0] ?? null
}

function area(shape: TextAreaShape) {
  return shape.width * shape.height
}
