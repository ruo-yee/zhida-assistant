import type { HostWindow } from './types.ts'

export function parseBoundsLine(line: string): HostWindow | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('{')) return null
  const match = trimmed.match(
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*(.*))?$/,
  )
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  const width = Number(match[3])
  const height = Number(match[4])
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width < 80 || height < 80) return null
  return { x, y, width, height, title: (match[5] ?? '').trim() || '微信' }
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
