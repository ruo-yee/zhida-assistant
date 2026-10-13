import type { KnowledgeHit } from '../types.ts'
import type { KnowledgeDoc } from './corpus.ts'

export const SCORE_THRESHOLD = 0.7
export const RESULT_LIMIT = 3

export function includesKeyword(text: string, keyword: string) {
  if (text.includes(keyword)) return true
  if (/[A-Za-z]/.test(keyword) && text.toLowerCase().includes(keyword.toLowerCase())) return true
  return false
}

/**
 * Coverage score for the demo corpus.
 * One weak keyword stays under the display threshold.
 * Two or more keywords, with an anchor term, land in the 0.7–0.98 band.
 */
export function keywordScore(text: string, keywords: string[], anchors: string[]) {
  const matched = keywords.filter((keyword) => includesKeyword(text, keyword))
  if (matched.length === 0) return 0
  if (matched.length === 1) return 0.64
  const coverage = matched.length / keywords.length
  const anchorHit = anchors.some((anchor) => includesKeyword(text, anchor))
  const raw = (anchorHit ? 0.8 : 0.66) + coverage * (anchorHit ? 0.16 : 0.12)
  return Math.round(Math.min(0.98, raw) * 100) / 100
}

export function rankDocuments(text: string, docs: KnowledgeDoc[], limit = RESULT_LIMIT): KnowledgeHit[] {
  return docs
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      version: doc.version,
      sourceLabel: doc.sourceLabel,
      updatedAt: doc.updatedAt,
      excerpt: doc.excerpt,
      body: doc.body,
      icon: doc.icon,
      score: keywordScore(text, doc.keywords, doc.anchors),
    }))
    .filter((hit) => hit.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh'))
    .slice(0, limit)
}
