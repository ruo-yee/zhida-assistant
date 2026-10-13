import type { HostWindow } from './types.ts'

export function parseBoundsLine(line: string): HostWindow | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const parts = trimmed.split(',')
  if (parts.length < 5) return null
  const [rawX, rawY, rawWidth, rawHeight, ...titleParts] = parts
  const x = Number(rawX)
  const y = Number(rawY)
  const width = Number(rawWidth)
  const height = Number(rawHeight)
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width < 80 || height < 80) return null
  return { x, y, width, height, title: titleParts.join(',').trim() }
}

export function parseBoundsReport(stdout: string): HostWindow | null {
  const windows = stdout
    .split(/\r?\n/)
    .map((line) => parseBoundsLine(line))
    .filter((window): window is HostWindow => window !== null)
  windows.sort((a, b) => b.width * b.height - a.width * a.height)
  return windows[0] ?? null
}

export function isAssistivePermissionError(stderr: string) {
  return /not authorized|not allowed|assistive|-25211|-1743|1002|不允许|辅助功能/i.test(stderr)
}
