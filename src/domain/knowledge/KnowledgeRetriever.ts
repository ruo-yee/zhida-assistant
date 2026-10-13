import type { KnowledgeHit } from '../types.ts'
import { CORPUS, type KnowledgeDoc } from './corpus.ts'
import { rankDocuments } from './rank.ts'

const CONTINUATION = /第二个|还有|另外|以及|同时|再问|补充/
const QUESTION = /[?？]|怎么|如何|什么|怎样|吗|呢|哪|几/

export interface RetrievalMessage {
  role: 'customer' | 'agent'
  text: string
}

export interface RetrievalInput {
  messages: RetrievalMessage[]
  enabledDocIds?: string[]
}

/**
 * Retrieval port. The demo ranks a bundled corpus with keyword coverage.
 * A later adapter can swap in embedding search and still return `KnowledgeHit`.
 */
export interface KnowledgeRetriever {
  search(input: RetrievalInput): Promise<KnowledgeHit[]>
}

/** Latest question wins. A continuation such as「第二个问题」still searches the recent turns together. */
export function resolveRetrievalText(messages: RetrievalMessage[], docs: KnowledgeDoc[]) {
  const customer = messages.filter((message) => message.role === 'customer').slice(-4)
  const latest = customer.at(-1)?.text.trim() ?? ''
  const earlier = customer
    .slice(0, -1)
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join('\n')
  if (!latest) return earlier
  if (CONTINUATION.test(latest) && earlier) return `${earlier}\n${latest}`
  if (rankDocuments(latest, docs).length > 0) return latest
  if (!QUESTION.test(latest) && earlier) return earlier
  return latest
}

export function createKnowledgeRetriever(docs: KnowledgeDoc[] = CORPUS): KnowledgeRetriever {
  return {
    async search(input) {
      const allowed = input.enabledDocIds
        ? docs.filter((doc) => input.enabledDocIds?.includes(doc.id))
        : docs
      return rankDocuments(resolveRetrievalText(input.messages, allowed), allowed)
    },
  }
}
