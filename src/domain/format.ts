export function formatRelevance(score: number): string {
  const clamped = clamp01(score)
  return `相关度 ${clamped.toFixed(2)}`
}

export function formatDocTitle(title: string, version: string): string {
  return `${title} (${version})`
}

export function formatSourceTooltip(sourceLabel: string, updatedAt: string): string {
  return `来自${sourceLabel} · 最后更新 ${updatedAt}`
}

export function formatResultCount(count: number): string {
  return `${count} 个结果`
}

export function formatChatType(chatType: 'private' | 'group'): string {
  return chatType === 'private' ? '私聊' : '群聊'
}

export function formatPresence(presence: 'online' | 'offline'): string {
  return presence === 'online' ? '在线' : '离线'
}

export function formatSessionChip(
  peerName: string,
  chatType: 'private' | 'group',
  intent: string,
): string {
  return `${peerName} · ${formatChatType(chatType)} · 意图「${intent}」`
}

export function formatHitSummary(hit: { title: string; version: string; score: number }): string {
  return `${formatDocTitle(hit.title, hit.version)} · ${formatRelevance(hit.score)}`
}

function clamp01(score: number) {
  if (!Number.isFinite(score)) return 0
  return Math.min(1, Math.max(0, score))
}
