import type { KnowledgeHit, Persona } from '../types.ts'

export interface ModelConfig {
  mode: 'local' | 'openai'
  apiKey: string
  baseUrl: string
  model: string
}

export interface OpenAIReplyInput {
  persona: Persona
  intent: string
  customerText: string
  hits: Array<Pick<KnowledgeHit, 'title' | 'version' | 'excerpt' | 'score'>>
}

const PERSONA_HINT: Record<Persona, string> = {
  professional: '专业、简明，先给结论，适合直接发到微信。',
  warm: '语气亲切，先接住对方的问题，再给结论。',
  technical: '保留机制说明，但不要编造知识摘录里没有的数字。',
}

export async function completeOpenAI(config: ModelConfig, input: OpenAIReplyInput): Promise<string> {
  const base = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              '你是微信坐席旁边的回复起草助手。只输出可直接发送的中文回复，不要标题、不要解释写作过程。只能依据给定知识摘录，摘录没有的数字和承诺不要写。',
          },
          {
            role: 'user',
            content: [
              `人设：${PERSONA_HINT[input.persona]}`,
              `意图：${input.intent}`,
              `客户刚刚说：${input.customerText}`,
              '知识摘录：',
              ...input.hits.map(
                (hit, index) =>
                  `${index + 1}. ${hit.title} (${hit.version}) 相关度 ${hit.score.toFixed(2)}：${hit.excerpt}`,
              ),
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
    return text.trim()
  } finally {
    clearTimeout(timer)
  }
}
