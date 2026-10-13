import type { IntentLabel, Persona } from '../types.ts'
import type { PersonaVoice } from './personas.ts'

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
  voice: PersonaVoice
  intent: IntentLabel
  customerText: string
}): string[] {
  const topic = clip(input.customerText)
  const heard = topic ? `你刚说「${topic}」。` : '我在。'
  const lines =
    input.intent === '确认'
      ? ['好的，我记下了。', '收到，有下一步你再叫我。', '明白。需要我帮你组织一句发给对方的话，直接说。']
      : linesFor(input.voice, heard)
  return lines.map((line) => toneWrap(line, input.tone))
}

function linesFor(voice: PersonaVoice, heard: string) {
  if (voice === 'casual') {
    return [
      `${heard}哈哈，我接着听。`,
      '这句我当闲聊回，不往产品说明上靠。你想继续聊，还是换个话题？',
      '我在。你直接说就行，不用组织得很正式。',
    ]
  }
  if (voice === 'advisor') {
    return [
      `${heard}我先不替你下结论。你更想听一个建议，还是先把情况说完？`,
      '信息还不够时，我不会编一个看起来很完整的答案。你补充一点具体目标就行。',
      '可以。我按顾问的方式给你一个下一步，你再决定发不发。',
    ]
  }
  if (voice === 'api') {
    return [
      `${heard}你是想查接口用法，还是先把情况说完？`,
      '如果是调用失败，告诉我大概时间和状态码就行，别发完整密钥。',
      '这边先按对话回你。没有对上的说明时，我不编造额度、价格或退款。',
    ]
  }
  if (voice === 'custom') {
    return [
      `${heard}我按你保存的人设来接这句话。`,
      '你要是想换种说法，直接告诉我更短、更正式，或更口语。',
      '这句我当聊天回，不套知识库里的产品说明。',
    ]
  }
  return [
    `${heard}我接着听，你想先聊哪一句？`,
    '这件事我按聊天来回，不套产品说明。你更想我接话，还是帮你出个主意？',
    '我在。你可以直接讲近况，或者说一句希望我怎么回。',
  ]
}
