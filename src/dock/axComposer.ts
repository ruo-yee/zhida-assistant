/** WeChat's chat composer. Exact identifier when the tree exposes one. */
export const COMPOSER_IDENTIFIER = 'chat_input_field'

export interface ComposerShape {
  role: string
  identifier: string
  title: string
  width: number
  height: number
}

/**
 * The writable chat box. Prefer the known identifier, then the largest text
 * area. A search field is not the composer. One text area with no measured
 * size is still the box — WeChat often hides AXSize until the tree is warm.
 */
export function pickComposer<T>(items: T[], shapeOf: (item: T) => ComposerShape): T | null {
  const text = items.filter((item) => {
    const role = shapeOf(item).role
    return role === 'AXTextArea' || role === 'AXTextField'
  })
  const named = text.find((item) => shapeOf(item).identifier === COMPOSER_IDENTIFIER)
  if (named) return named
  const areas = text.filter((item) => {
    const shape = shapeOf(item)
    return shape.role === 'AXTextArea' && shape.width >= 80 && shape.height >= 16
  })
  if (areas.length > 0) {
    return [...areas].sort((a, b) => area(shapeOf(b)) - area(shapeOf(a)))[0] ?? null
  }
  const bare = text.filter((item) => shapeOf(item).role === 'AXTextArea')
  if (bare.length === 1) return bare[0] ?? null
  const fields = text.filter((item) => {
    const shape = shapeOf(item)
    if (shape.role !== 'AXTextField' || shape.width < 160) return false
    if (shape.identifier === 'search_field' || shape.title.includes('搜索')) return false
    return true
  })
  if (fields.length === 0) return null
  return [...fields].sort((a, b) => area(shapeOf(b)) - area(shapeOf(a)))[0] ?? null
}

function area(shape: ComposerShape) {
  return shape.width * shape.height
}

/**
 * Click the composer, not the send button.
 * `frame` is top-left, the same space as the window server.
 * The returned point is bottom-left, which is what a mouse event expects.
 * 62% across and 16% up from the bottom matches the reference fill point.
 */
export function composerClickPoint(
  frame: { x: number; y: number; width: number; height: number },
  primaryHeight: number,
): { x: number; y: number } | null {
  if (frame.width < 240 || frame.height < 240 || !(primaryHeight > 0)) return null
  const x = frame.x + frame.width * 0.62
  const fromTop = frame.y + frame.height * 0.84
  const y = primaryHeight - fromTop
  if (!(x > 0) || !(y > 0)) return null
  return { x, y }
}
