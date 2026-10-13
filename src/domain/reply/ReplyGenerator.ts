import type { IntentLabel, KnowledgeHit, Persona } from '../types.ts'
import { buildChatVariants } from './chatReplies.ts'
import { buildMockVariants } from './mockReplies.ts'
import { completeOpenAI, type ModelConfig } from './openaiReply.ts'
import { fillThree } from './parseReplies.ts'
import type { ChatTurn } from './chatContext.ts'
import type { PersonaVoice } from './personas.ts'

export type ReplyGrounding = 'grounded' | 'chat'

export interface ReplyInput {
  persona: Persona
  voice: PersonaVoice
  personaText: string
  intent: IntentLabel
  customerText: string
  /** Recent WeChat messages. This is 上下文 for the model, not the knowledge hits. */
  turns?: ChatTurn[]
  grounding: ReplyGrounding
  hits: Array<Pick<KnowledgeHit, 'id' | 'title' | 'version' | 'excerpt' | 'score'>>
}

export interface ReplyBatch {
  variants: string[]
  provider: 'mock' | 'openai'
  grounding: ReplyGrounding
  warning?: string
}

export function groundingFor(intent: IntentLabel, hits: Array<{ score: number }>): ReplyGrounding {
  if (intent === '闲聊' || intent === '确认') return 'chat'
  const top = hits[0]?.score ?? 0
  return top >= 0.7 ? 'grounded' : 'chat'
}

/**
 * Reply port. Local drafts always exist.
 * An OpenAI-compatible endpoint, including a local Ollama server, is optional.
 */
export interface ReplyGenerator {
  generate(input: ReplyInput): Promise<ReplyBatch>
}

function localVariants(input: ReplyInput) {
  if (input.grounding === 'chat') {
    return buildChatVariants({
      tone: input.persona,
      voice: input.voice,
      intent: input.intent,
      customerText: input.customerText,
    })
  }
  const drafts = buildMockVariants({ persona: input.persona, hits: input.hits })
  return drafts.map((text) => styleGrounded(text, input.voice))
}

function styleGrounded(text: string, voice: PersonaVoice) {
  if (voice === 'api') {
    return text
      .replace(/^关于您提到的两个问题：/, '关于您问的两点，文档里是这样写的：')
      .replace(/^分两点说明：/, '文档里分两点：')
      .replace(/^您这两个问题可以这样理解：/, '按文档，这两点可以这样理解：')
  }
  if (voice === 'casual') {
    return text
      .replace(/^关于您提到的两个问题：/, '这两点可以这样说：')
      .replace(/^分两点说明：/, '简单说两点：')
      .replace(/^您这两个问题可以这样理解：/, '换个轻松点的说法：')
  }
  if (voice === 'advisor') {
    return text
      .replace(/^关于您提到的两个问题：/, '按现有说明，建议这样处理：')
      .replace(/^分两点说明：/, '建议分两点处理：')
      .replace(/^您这两个问题可以这样理解：/, '建议这样理解这两点：')
  }
  return text
}

export function createReplyGenerator(options: {
  resolveConfig: () => ModelConfig
}): ReplyGenerator {
  return {
    async generate(input) {
      const mocks = localVariants(input)
      const config = options.resolveConfig()
      if (config.mode !== 'openai' || !config.baseUrl.trim()) {
        return { variants: mocks, provider: 'mock', grounding: input.grounding }
      }
      try {
        const remote = await completeOpenAI(config, input)
        return { variants: fillThree(remote, mocks), provider: 'openai', grounding: input.grounding }
      } catch {
        return { variants: mocks, provider: 'mock', grounding: input.grounding, warning: '模型不可用，已改用本地草稿' }
      }
    },
  }
}
