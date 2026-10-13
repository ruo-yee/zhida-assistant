import type { ReplyInput } from './ReplyGenerator.ts'
import { parseReplyBatch } from './parseReplies.ts'
import { TONE_HINT } from './personas.ts'

export interface ModelConfig {
  mode: 'local' | 'openai'
  apiKey: string
  baseUrl: string
  model: string
}

export async function completeOpenAI(config: ModelConfig, input: ReplyInput): Promise<string[]> {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  const grounded = input.grounding === 'grounded'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        temperature: grounded ? 0.4 : 0.7,
        messages: [
          {
            role: 'system',
            content: grounded
              ? '你是微信旁边的回复起草助手。根据给定人设，写出三条可直接发送的中文回复，都要依据知识摘录，摘录没有的数字、价格、时限和承诺不要写。三条之间用单独一行的 --- 分隔。不要标题，不要解释。'
              : '你是微信旁边的回复起草助手。对方这条更像日常聊天，或知识库没有够格的依据。根据给定人设写出三条短回复，每条一两到三句，可直接发送。不要编造产品事实、价格、额度或政策。三条之间用单独一行的 --- 分隔。不要标题，不要解释。',
          },
          {
            role: 'user',
            content: [
              `人设：${input.personaText}`,
              `语气：${TONE_HINT[input.persona]}`,
              `意图：${input.intent}`,
              `对方刚刚说：${input.customerText}`,
              grounded ? '知识摘录：' : '不要引用不存在的文档。',
              ...(grounded
                ? input.hits.map(
                    (hit, index) =>
                      `${index + 1}. ${hit.title} (${hit.version}) 相关度 ${hit.score.toFixed(2)}：${hit.excerpt}`,
                  )
                : []),
            ].join('\n'),
          },
        ],
      }),
    })
    if (!response.ok) throw new Error(`model ${response.status}`)
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const text = payload.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error('empty completion')
    const replies = parseReplyBatch(text)
    if (replies.length === 0) throw new Error('empty completion')
    return replies
  } finally {
    clearTimeout(timer)
  }
}
