import type { IntentLabel, KnowledgeHit, Persona } from '../types.ts'
import { buildChatVariants } from './chatReplies.ts'
import { buildMockVariants } from './mockReplies.ts'
import { completeOpenAI, type ModelConfig } from './openaiReply.ts'
import { fillThree } from './parseReplies.ts'
import type { PersonaRole } from './personas.ts'

export type ReplyGrounding = 'grounded' | 'chat'

export interface ReplyInput {
  persona: Persona
  role: PersonaRole
  personaText: string
  intent: IntentLabel
  customerText: string
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
      role: input.role,
      intent: input.intent,
      customerText: input.customerText,
    })
  }
  const drafts = buildMockVariants({ persona: input.persona, hits: input.hits })
  if (input.role === 'api') return drafts.map(asApiVoice)
  return drafts
}

function asApiVoice(text: string) {
  return text
    .replace(/^关于您提到的两个问题：/, '关于您问的两点，文档里是这样写的：')
    .replace(/^分两点说明：/, '文档里分两点：')
    .replace(/^您这两个问题可以这样理解：/, '按文档，这两点可以这样理解：')
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
