import type { Persona } from '../types.ts'

export type PersonaVoice = 'support' | 'casual' | 'advisor' | 'api' | 'custom'

export interface PersonaRecord {
  id: string
  name: string
  detail: string
  prompt: string
  builtin: boolean
}

export interface SavedPersona {
  id: string
  name: string
  prompt: string
}

export const BUILTIN_PERSONAS: readonly PersonaRecord[] = [
  {
    id: 'support',
    name: '客服助手',
    detail: '礼貌、清楚，先接住问题再给下一步',
    builtin: true,
    prompt:
      '你是产品客服助手。礼貌、清楚、有耐心。先确认对方真正想解决的事，再给能执行的下一步。不替对方做重大决定，不编造没有依据的价格、时限、额度或承诺。',
  },
  {
    id: 'casual',
    name: '轻松闲聊',
    detail: '口语、短句，先接话再顺着聊',
    builtin: true,
    prompt:
      '你在微信里轻松聊天。口语、短句、有来有回。先接住对方刚说的话，再自然往下聊。不端着，不说教。没有依据时不编造产品事实、价格、额度或政策。',
  },
  {
    id: 'advisor',
    name: '专业顾问',
    detail: '先给判断，再给一个可执行的建议',
    builtin: true,
    prompt:
      '你是专业顾问。先给判断，再给一个对方现在就能做的建议。语气稳、具体、不啰嗦。依据不够时说明还缺什么，不编造数字、时限和承诺。',
  },
  {
    id: 'api',
    name: 'API平台客服',
    detail: '先核对调用目标，不收集完整密钥',
    builtin: true,
    prompt:
      '你是 API 平台的客服。专业、准确、耐心、简洁。先确认对方的问题和目标，再给排查或使用步骤。遇到调用失败时，优先核对时间、模型名、接口地址、状态码和请求编号。提醒对方不要发送完整密钥、令牌、Cookie 或密码。价格、余额、套餐、退款和可用模型以控制台、订单和条款为准，不虚构合作、补偿或永久有效。信息不够时说明还缺哪一项脱敏信息。',
  },
]

const BUILTIN_IDS = new Set(BUILTIN_PERSONAS.map((persona) => persona.id))
const NAME_LIMIT = 24
const PROMPT_LIMIT = 2000
export const CUSTOM_PERSONA_LIMIT = 12

export const TONE_HINT: Record<Persona, string> = {
  professional: '语气专业、简明，先给结论，适合直接发到微信。',
  warm: '语气亲切，先接住对方，再给结论。',
  technical: '保留必要的机制说明，但不编造摘录或对话里没有的数字。',
}

export function createPersonaId() {
  return `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function voiceOf(id: string): PersonaVoice {
  if (id === 'support' || id === 'casual' || id === 'advisor' || id === 'api') return id
  return 'custom'
}

export function sanitizeCustomPersonas(value: unknown): SavedPersona[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: SavedPersona[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Partial<SavedPersona>
    const id = typeof record.id === 'string' ? record.id : ''
    if (!/^c_[a-z0-9]+$/i.test(id) || BUILTIN_IDS.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name: cleanName(record.name),
      prompt: cleanPrompt(record.prompt),
    })
    if (out.length === CUSTOM_PERSONA_LIMIT) break
  }
  return out
}

export function listPersonas(custom: SavedPersona[]): PersonaRecord[] {
  return [
    ...BUILTIN_PERSONAS,
    ...custom.map((persona) => ({
      id: persona.id,
      name: persona.name,
      detail: '自定义',
      prompt: persona.prompt,
      builtin: false,
    })),
  ]
}

export function resolvePersona(id: string, custom: SavedPersona[]): PersonaRecord {
  return listPersonas(custom).find((persona) => persona.id === id) ?? BUILTIN_PERSONAS[0]
}

export function personaPrompt(id: string, custom: SavedPersona[]) {
  const persona = resolvePersona(id, custom)
  const text = persona.prompt.trim()
  return text || BUILTIN_PERSONAS[0].prompt
}

export function cleanName(value: unknown) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return (name || '未命名人设').slice(0, NAME_LIMIT)
}

export function cleanPrompt(value: unknown) {
  return typeof value === 'string' ? value.slice(0, PROMPT_LIMIT) : ''
}

export function migratePersonaSettings(parsed: {
  activePersonaId?: unknown
  customPersonas?: unknown
  personaRole?: unknown
  customPersona?: unknown
}): { activePersonaId: string; customPersonas: SavedPersona[] } {
  const customPersonas = sanitizeCustomPersonas(parsed.customPersonas)
  if (parsed.customPersonas !== undefined || typeof parsed.activePersonaId === 'string') {
    const requested = typeof parsed.activePersonaId === 'string' ? parsed.activePersonaId : 'support'
    const known = listPersonas(customPersonas).some((persona) => persona.id === requested)
    return { activePersonaId: known ? requested : 'support', customPersonas }
  }
  if (parsed.personaRole === 'api') return { activePersonaId: 'api', customPersonas: [] }
  if (parsed.personaRole === 'casual') return { activePersonaId: 'casual', customPersonas: [] }
  if (parsed.personaRole === 'advisor') return { activePersonaId: 'advisor', customPersonas: [] }
  if (parsed.personaRole === 'custom') {
    const prompt = cleanPrompt(parsed.customPersona)
    if (!prompt.trim()) return { activePersonaId: 'support', customPersonas: [] }
    const id = 'c_migrated'
    return { activePersonaId: id, customPersonas: [{ id, name: '自定义人设', prompt }] }
  }
  return { activePersonaId: 'support', customPersonas: [] }
}
