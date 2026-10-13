import type { WeChatSession } from './WeChatBridge.ts'

export const SEED_CUSTOMER_TEXTS = [
  '你好！关于产品 FAQ，我想再确认几个问题，可以吗？',
  '第一，离线模式下，数据同步是怎么处理的？',
  '明白了，第二个问题是权限控制的最小粒度是怎样的？',
] as const

export const DEMO_PROMPTS = [
  {
    id: 'offline',
    label: '客户追问离线同步',
    text: '离线模式如果中途断网，本地缓存会不会丢？增量同步还在吗？',
  },
  {
    id: 'acl',
    label: '客户追问权限粒度',
    text: '权限能不能细到某个资源的删除操作？不同角色要分开配置。',
  },
  {
    id: 'empty',
    label: '客户问无关问题',
    text: '今天天气怎么样，适合出门吗？',
  },
] as const

export function createSeedSession(): WeChatSession {
  return {
    id: 'session-zhangming',
    peerName: '张明',
    presence: 'online',
    chatType: 'private',
    composerText: '',
    messages: [
      { id: 'm1', role: 'customer', text: SEED_CUSTOMER_TEXTS[0], timeLabel: '10:24' },
      { id: 'm2', role: 'agent', text: '当然可以，请随时问。' },
      { id: 'm3', role: 'customer', text: SEED_CUSTOMER_TEXTS[1], timeLabel: '10:26' },
      {
        id: 'm4',
        role: 'agent',
        text: '在离线模式下，客户端会将操作记录在本地缓存中；当网络恢复时，客户端会自动以本地数据为优先，与服务器进行增量同步，确保数据一致且不丢失。',
      },
      { id: 'm5', role: 'customer', text: SEED_CUSTOMER_TEXTS[2], timeLabel: '10:28' },
    ],
  }
}
