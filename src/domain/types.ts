export type Persona = 'professional' | 'warm' | 'technical'

export type IntentLabel = '询问' | '确认' | '故障' | '投诉' | '购买' | '闲聊'

export type ScoreBand = 'high' | 'mid' | 'low'

export type DocIcon = 'doc' | 'shield' | 'sync' | 'users' | 'lock' | 'key'

export interface KnowledgeHit {
  id: string
  title: string
  version: string
  sourceLabel: string
  updatedAt: string
  excerpt: string
  body: string
  score: number
  icon: DocIcon
}
