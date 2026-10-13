import type { Persona } from '../types.ts'

export type PersonaRole = 'support' | 'api' | 'custom'

export const PERSONA_PRESETS: Record<Exclude<PersonaRole, 'custom'>, { title: string; detail: string; text: string }> = {
  support: {
    title: '客服助手',
    detail: '礼貌、清楚，先接住问题再给下一步',
    text: '你是产品客服助手。礼貌、清楚、有耐心。先确认对方真正想解决的事，再给能执行的下一步。不替对方做重大决定，不编造没有依据的价格、时限、额度或承诺。',
  },
  api: {
    title: 'API平台客服',
    detail: '先核对调用目标，不收集完整密钥',
    text: '你是 API 平台的客服。专业、准确、耐心、简洁。先确认对方的问题和目标，再给排查或使用步骤。遇到调用失败时，优先核对时间、模型名、接口地址、状态码和请求编号。提醒对方不要发送完整密钥、令牌、Cookie 或密码。价格、余额、套餐、退款和可用模型以控制台、订单和条款为准，不虚构合作、补偿或永久有效。信息不够时说明还缺哪一项脱敏信息。',
  },
}

export const TONE_HINT: Record<Persona, string> = {
  professional: '语气专业、简明，先给结论，适合直接发到微信。',
  warm: '语气亲切，先接住对方，再给结论。',
  technical: '保留必要的机制说明，但不编造摘录或对话里没有的数字。',
}

export function personaPrompt(role: PersonaRole, customText: string) {
  if (role === 'custom') {
    const text = customText.trim()
    return text || PERSONA_PRESETS.support.text
  }
  return PERSONA_PRESETS[role].text
}

export function isPersonaRole(value: unknown): value is PersonaRole {
  return value === 'support' || value === 'api' || value === 'custom'
}
