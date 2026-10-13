import type { IntentLabel, Persona } from '../types.ts'
import type { PersonaRole } from './personas.ts'

function clip(text: string) {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length <= 18) return value
  return `${value.slice(0, 18)}…`
}

function toneWrap(text: string, tone: Persona) {
  if (tone === 'warm' && !text.startsWith('好的')) return `好的，${text}`
  if (tone === 'technical') return `${text}\n这句没有引用知识库，也没有补充库外数字。`
  return text
}

export function buildChatVariants(input: {
  tone: Persona
  role: PersonaRole
  intent: IntentLabel
  customerText: string
}): string[] {
  const topic = clip(input.customerText)
  const heard = topic ? `你刚说「${topic}」。` : '我在。'
  const lines =
    input.intent === '确认'
      ? ['好的，我记下了。', '收到，有下一步你再叫我。', '明白。需要我帮你组织一句发给对方的话，直接说。']
      : input.role === 'api'
        ? [
            `${heard}你是想查接口用法，还是先把情况说完？`,
            '如果是调用失败，告诉我大概时间和状态码就行，别发完整密钥。',
            '这边先按对话回你。没有对上的说明时，我不编造额度、价格或退款。',
          ]
        : input.role === 'custom'
          ? [
              `${heard}我按你写的人设来接这句话。`,
              '你要是想换种说法，直接告诉我更短、更正式，或更口语。',
              '这句我当聊天回，不套知识库里的产品说明。',
            ]
          : [
              `${heard}我接着听，你想先聊哪一句？`,
              '这件事我按聊天来回，不套产品说明。你更想我接话，还是帮你出个主意？',
              '我在。你可以直接讲近况，或者说一句希望我怎么回。',
            ]
  return lines.map((line) => toneWrap(line, input.tone))
}
