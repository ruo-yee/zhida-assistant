import type { IntentLabel, KnowledgeHit, Persona } from '../types.ts'
import { buildMockVariants } from './mockReplies.ts'
import { completeOpenAI, type ModelConfig } from './openaiReply.ts'

export interface ReplyInput {
  persona: Persona
  intent: IntentLabel
  customerText: string
  hits: Array<Pick<KnowledgeHit, 'id' | 'title' | 'version' | 'excerpt' | 'score'>>
}

export interface ReplyBatch {
  variants: string[]
  provider: 'mock' | 'openai'
  warning?: string
}

/**
 * Reply port. Local drafts always exist.
 * An OpenAI-compatible endpoint is optional and falls back to those drafts.
 */
export interface ReplyGenerator {
  generate(input: ReplyInput): Promise<ReplyBatch>
}

export function createReplyGenerator(options: {
  resolveConfig: () => ModelConfig
}): ReplyGenerator {
  return {
    async generate(input) {
      const mocks = buildMockVariants(input)
      const config = options.resolveConfig()
      if (config.mode !== 'openai' || !config.apiKey.trim()) {
        return { variants: mocks, provider: 'mock' }
      }
      try {
        const text = await completeOpenAI(config, input)
        const rest = mocks.filter((item) => item !== text).slice(0, 2)
        return { variants: [text, ...rest], provider: 'openai' }
      } catch {
        return { variants: mocks, provider: 'mock', warning: '模型不可用，已改用本地草稿' }
      }
    },
  }
}
