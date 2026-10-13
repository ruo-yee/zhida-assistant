export function parseReplyBatch(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{') || trimmed.startsWith('```')) {
    const json = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    try {
      const payload = JSON.parse(json) as { replies?: unknown }
      if (Array.isArray(payload.replies)) {
        return payload.replies
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 3)
      }
    } catch {
      /* numbered or delimited text */
    }
  }
  const blocks = trimmed
    .split(/\n\s*---\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (blocks.length >= 2) return blocks.slice(0, 3)
  const numbered = trimmed
    .split(/\n(?=\s*\d+[.、．)]\s*)/)
    .map((item) => item.replace(/^\s*\d+[.、．)]\s*/, '').trim())
    .filter(Boolean)
  if (numbered.length >= 2) return numbered.slice(0, 3)
  return [trimmed]
}

export function fillThree(primary: string[], fallback: string[]) {
  const out: string[] = []
  for (const item of [...primary, ...fallback]) {
    const text = item.trim()
    if (!text || out.includes(text)) continue
    out.push(text)
    if (out.length === 3) break
  }
  while (out.length < 3 && out[0]) out.push(out[0])
  return out.slice(0, 3)
}
