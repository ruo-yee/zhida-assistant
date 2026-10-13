import type { KnowledgeHit, Persona } from '../types.ts'

export const BASELINE_REPLY = `关于您提到的两个问题：
1. 离线模式下，客户端会将操作记录在本地缓存中；当网络恢复时，客户端会自动以本地数据为优先，与服务器进行增量同步，确保数据一致且不丢失。
2. 权限控制的最小粒度支持到「资源 + 操作」级别，您可以为不同角色配置特定资源的查看、编辑或删除权限，灵活满足权限隔离需求。`

const DUAL_SHORT = `分两点说明：
1. 离线时操作先写入本地缓存；网络恢复后以本地数据优先做增量同步，避免丢失。
2. 权限最小粒度是「资源 + 操作」，可按角色分别授予查看、编辑或删除。`

const DUAL_PLAIN = `您这两个问题可以这样理解：
1. 离线模式不会直接丢数据。客户端先把操作记在本地，恢复联网后按本地优先做增量同步，再和服务器对齐。
2. 权限可以拆到「资源 + 操作」。例如同一份资料，有的角色只能看，有的可以改或删除。`

const OFFLINE_VARIANTS = [
  `离线时客户端会把操作记在本地缓存里。网络恢复后，以本地数据为优先做增量同步，已经写下的内容不会因为断网丢掉。`,
  `可以放心。断网期间的操作留在本地队列里，恢复后从确认点继续增量同步，已确认的部分不会重放。`,
  `离线缓存会保留。恢复联网后按本地优先上传未提交的操作，再拉取服务器变更；如果同一处两边都改过，会留下冲突记录而不是静默覆盖。`,
]

const ACL_VARIANTS = [
  `权限的最小粒度是「资源 + 操作」。您可以为不同角色分别配置某一类资源的查看、编辑或删除，而不必整页放开。`,
  `可以细到具体资源上的某一个操作。例如有的角色只能查看，有的角色可以编辑或删除，角色之间也不会自动继承。`,
  `按「资源 + 操作」授权即可。查看、编辑、删除要分开勾选，需要隔离时给不同角色各配一组，而不是共用一个总开关。`,
]

export interface MockReplyInput {
  persona: Persona
  hits: Array<Pick<KnowledgeHit, 'id' | 'title' | 'excerpt'>>
}

export function buildMockVariants(input: MockReplyInput): string[] {
  const ids = new Set(input.hits.map((hit) => hit.id))
  const hasOffline = ids.has('faq-offline') || ids.has('sync-strategy')
  const hasAcl = ids.has('acl') || ids.has('rbac')
  const variants =
    hasOffline && hasAcl
      ? [BASELINE_REPLY, DUAL_SHORT, DUAL_PLAIN]
      : hasOffline
        ? OFFLINE_VARIANTS
        : hasAcl
          ? ACL_VARIANTS
          : genericVariants(input.hits)
  return variants.map((text) => applyPersona(text, input.persona))
}

function genericVariants(hits: MockReplyInput['hits']) {
  const lines = hits.map((hit, index) => `${index + 1}. ${hit.title}：${hit.excerpt}`).join('\n')
  return [
    `根据知识库，可以这样回复：\n${lines}`,
    `我查到这些材料，供您直接转述：\n${lines}`,
    `结论如下，细节以知识库原文为准：\n${lines}`,
  ]
}

function applyPersona(text: string, persona: Persona) {
  if (persona === 'warm') return `好的，${text}`
  if (persona === 'technical') return `${text}\n\n补充：以上口径与知识库条目一致，没有库外的时延或配额数字。`
  return text
}
