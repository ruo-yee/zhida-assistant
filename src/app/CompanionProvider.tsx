import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { classifyIntent } from '../domain/intent.ts'
import { CORPUS } from '../domain/knowledge/corpus.ts'
import { createKnowledgeRetriever } from '../domain/knowledge/KnowledgeRetriever.ts'
import { groundingFor, createReplyGenerator } from '../domain/reply/ReplyGenerator.ts'
import {
  cleanPrompt,
  createPersonaId,
  CUSTOM_PERSONA_LIMIT,
  listPersonas,
  personaPrompt,
  resolvePersona,
  voiceOf,
  type SavedPersona,
} from '../domain/reply/personas.ts'
import type { ReplyGrounding } from '../domain/reply/ReplyGenerator.ts'
import type { IntentLabel, KnowledgeHit, Persona } from '../domain/types.ts'
import { MockWeChatBridge, type DraftEcho } from '../domain/wechat/MockWeChatBridge.ts'
import type { HostBridgeStatus } from '../domain/wechat/hostTypes.ts'
import type { WeChatSession } from '../domain/wechat/WeChatBridge.ts'
import { sleep } from '../lib/sleep.ts'
import { loadSettings, saveSettings, type ModelMode, type ThemeName } from './settings.ts'

export type Phase = 'loading' | 'ready' | 'empty' | 'error'
export type EmptyReason = 'nomatch' | 'disabled'

interface CompanionContextValue {
  session: WeChatSession
  focusSession: WeChatSession
  hostDetail: string | null
  echo: DraftEcho | null
  popId: string | null
  phase: Phase
  hits: KnowledgeHit[]
  draft: string
  editing: boolean
  dirty: boolean
  intent: IntentLabel
  intentFlashKey: number
  barEpoch: number
  errorEpoch: number
  variantIndex: number
  variants: string[]
  replyMode: ReplyGrounding
  variantCount: number
  regen: boolean
  sendState: 'idle' | 'sent'
  copyState: 'idle' | 'copied'
  wechatSending: boolean
  warning: string | null
  provider: 'mock' | 'openai'
  emptyReason: EmptyReason
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  sourceHit: KnowledgeHit | null
  openSource: (id: string) => void
  closeSource: () => void
  expandedId: string | null
  toggleExpanded: (id: string) => void
  theme: ThemeName
  toggleTheme: () => void
  persona: Persona
  setPersona: (persona: Persona) => void
  personas: ReturnType<typeof listPersonas>
  activePersonaId: string
  selectPersona: (id: string) => void
  addPersona: () => void
  renamePersona: (id: string, name: string) => void
  updatePersonaPrompt: (id: string, prompt: string) => void
  deletePersona: (id: string) => void
  docs: Array<{ id: string; title: string; version: string; enabled: boolean }>
  toggleDoc: (id: string) => void
  modelMode: ModelMode
  setModelMode: (mode: ModelMode) => void
  openaiBase: string
  openaiModel: string
  openaiKey: string
  setOpenaiBase: (value: string) => void
  setOpenaiModel: (value: string) => void
  setOpenaiKey: (value: string) => void
  rerun: () => void
  setDraft: (value: string) => void
  startEdit: () => void
  cancelEdit: () => void
  saveEdit: () => void
  insertToWeChat: () => void
  sendSuggestion: () => void
  regenerate: () => void
  selectVariant: (index: number) => void
  copySuggestion: () => void
  setComposerText: (value: string) => void
  sendComposer: () => void
  simulateCustomer: (text: string) => void
  simulateError: () => void
  resetSession: () => void
  retry: () => void
  toast: string | null
  notify: (text: string) => void
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  mobilePane: 'wechat' | 'companion'
  setMobilePane: (pane: 'wechat' | 'companion') => void
  narrow: boolean
}

const CompanionContext = createContext<CompanionContextValue | null>(null)

export function CompanionProvider({ children }: { children: ReactNode }) {
  const [bridge] = useState(() => new MockWeChatBridge())
  const [boot] = useState(loadSettings)
  const [session, setSession] = useState(() => bridge.getSnapshot())
  const [tracked, setTracked] = useState<WeChatSession | null>(null)
  const [hostDetail, setHostDetail] = useState<string | null>(null)
  const [echo, setEcho] = useState<DraftEcho | null>(null)
  const [popId, setPopId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [hits, setHits] = useState<KnowledgeHit[]>([])
  const [variants, setVariants] = useState<string[]>([])
  const [variantIndex, setVariantIndex] = useState(0)
  const [draft, setDraft] = useState('')
  const [committed, setCommitted] = useState('')
  const [editing, setEditing] = useState(false)
  const [intentFlashKey, setIntentFlashKey] = useState(0)
  const [barEpoch, setBarEpoch] = useState(0)
  const [errorEpoch, setErrorEpoch] = useState(0)
  const [regen, setRegen] = useState(false)
  const [sendState, setSendState] = useState<'idle' | 'sent'>('idle')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const [wechatSending, setWechatSending] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [provider, setProvider] = useState<'mock' | 'openai'>('mock')
  const [replyMode, setReplyMode] = useState<ReplyGrounding>('grounded')
  const [emptyReason, setEmptyReason] = useState<EmptyReason>('nomatch')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [theme, setTheme] = useState(boot.theme)
  const [persona, setPersona] = useState(boot.persona)
  const [activePersonaId, setActivePersonaId] = useState(boot.activePersonaId)
  const [customPersonas, setCustomPersonas] = useState(boot.customPersonas)
  const [enabledDocIds, setEnabledDocIds] = useState(boot.enabledDocIds)
  const [modelMode, setModelMode] = useState(boot.modelMode)
  const [openaiBase, setOpenaiBase] = useState(boot.openaiBase)
  const [openaiModel, setOpenaiModel] = useState(boot.openaiModel)
  const [openaiKey, setOpenaiKey] = useState(boot.openaiKey)
  const [toast, setToast] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobilePane, setMobilePane] = useState<'wechat' | 'companion'>('companion')
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 860px)').matches)
  const [sessionEpoch, setSessionEpoch] = useState(0)

  const settingsRef = useRef({
    persona,
    activePersonaId,
    customPersonas,
    enabledDocIds,
    modelMode,
    openaiBase,
    openaiModel,
    openaiKey,
  })
  const draftRef = useRef(draft)
  const committedRef = useRef(committed)
  const variantsRef = useRef(variants)
  const indexRef = useRef(variantIndex)
  const tokenRef = useRef(0)
  const forceErrorRef = useRef(false)
  const regenToken = useRef(0)
  const toastTimer = useRef<number | null>(null)
  const trackedRef = useRef<WeChatSession | null>(null)
  const seenCustomer = useRef<string | null>(null)

  const retrieverRef = useRef(createKnowledgeRetriever())
  const generatorRef = useRef(
    createReplyGenerator({
      resolveConfig: () => ({
        mode: settingsRef.current.modelMode,
        apiKey: settingsRef.current.openaiKey,
        baseUrl: settingsRef.current.openaiBase,
        model: settingsRef.current.openaiModel,
      }),
    }),
  )

  useEffect(() => {
    settingsRef.current = {
      persona,
      activePersonaId,
      customPersonas,
      enabledDocIds,
      modelMode,
      openaiBase,
      openaiModel,
      openaiKey,
    }
    draftRef.current = draft
    committedRef.current = committed
    variantsRef.current = variants
    indexRef.current = variantIndex
  }, [persona, activePersonaId, customPersonas, enabledDocIds, modelMode, openaiBase, openaiModel, openaiKey, draft, committed, variants, variantIndex])

  const notify = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  useEffect(() => {
    return bridge.subscribe(() => {
      setSession(bridge.getSnapshot())
      setEcho(bridge.getDraftEcho())
      setPopId(bridge.getLastSentId())
    })
  }, [bridge])

  useEffect(() => {
    const api = window.zhida?.wechat
    if (!api) return
    const apply = (status: HostBridgeStatus) => {
      setHostDetail(status.detail)
      const next = status.session
      trackedRef.current = next
      setTracked(next)
    }
    void api.getStatus().then(apply)
    return api.onStatus(apply)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)')
    const apply = () => setNarrow(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  const focusSession = tracked ?? session
  const latestCustomer = [...focusSession.messages].reverse().find((message) => message.role === 'customer')
  const intent = classifyIntent(latestCustomer?.text ?? '')

  useEffect(() => {
    if (seenCustomer.current === null) {
      seenCustomer.current = latestCustomer?.id ?? null
      return
    }
    if (latestCustomer && seenCustomer.current !== latestCustomer.id) {
      seenCustomer.current = latestCustomer.id
      setIntentFlashKey((value) => value + 1)
    }
  }, [latestCustomer])

  useEffect(() => {
    saveSettings({
      theme,
      persona,
      activePersonaId,
      customPersonas,
      enabledDocIds,
      modelMode,
      openaiBase,
      openaiModel,
      openaiKey,
    })
    document.documentElement.dataset.theme = theme
  }, [theme, persona, activePersonaId, customPersonas, enabledDocIds, modelMode, openaiBase, openaiModel, openaiKey])

  const runPipeline = useCallback(
    async (opts?: { retry?: boolean; fail?: boolean }) => {
      const token = ++tokenRef.current
      regenToken.current += 1
      setRegen(false)
      if (opts?.retry) forceErrorRef.current = false
      if (opts?.fail) forceErrorRef.current = true
      const fail = forceErrorRef.current
      setPhase('loading')
      setEditing(false)
      const started = Date.now()
      const wait = async () => {
        const remain = 480 - (Date.now() - started)
        if (remain > 0) await sleep(remain)
      }
      try {
        const active = trackedRef.current ?? (await bridge.getActiveSession())
        if (token !== tokenRef.current) return
        const customer = active.messages.filter((message) => message.role === 'customer')
        const latest = customer.at(-1)?.text ?? ''
        if (fail) {
          await wait()
          if (token !== tokenRef.current) return
          throw new Error('retrieval failed')
        }
        const enabled = settingsRef.current.enabledDocIds
        const found = await retrieverRef.current.search({
          messages: customer.slice(-4).map((message) => ({ role: message.role, text: message.text })),
          enabledDocIds: enabled,
        })
        if (token !== tokenRef.current) return
        const intentNow = classifyIntent(latest)
        const grounding = groundingFor(intentNow, enabled.length === 0 ? [] : found)
        const visibleHits = grounding === 'grounded' ? found : []
        const activePersona = resolvePersona(settingsRef.current.activePersonaId, settingsRef.current.customPersonas)
        const batch = await generatorRef.current.generate({
          persona: settingsRef.current.persona,
          voice: voiceOf(activePersona.id),
          personaText: personaPrompt(activePersona.id, settingsRef.current.customPersonas),
          intent: intentNow,
          customerText: latest,
          grounding,
          hits: visibleHits,
        })
        await wait()
        if (token !== tokenRef.current) return
        const first = batch.variants[0] ?? ''
        setHits(visibleHits)
        setVariants(batch.variants)
        setVariantIndex(0)
        setDraft(first)
        setCommitted(first)
        setWarning(batch.warning ?? null)
        setProvider(batch.provider)
        setReplyMode(batch.grounding)
        setEmptyReason(enabled.length === 0 ? 'disabled' : 'nomatch')
        setPhase('ready')
        setBarEpoch((value) => value + 1)
        setExpandedId(null)
        setSourceId(null)
      } catch {
        if (token !== tokenRef.current) return
        setHits([])
        setVariants([])
        setDraft('')
        setCommitted('')
        setPhase('error')
        setErrorEpoch((value) => value + 1)
      }
    },
    [bridge],
  )

  const lastCustomerId = useMemo(() => {
    for (let index = focusSession.messages.length - 1; index >= 0; index -= 1) {
      const message = focusSession.messages[index]
      if (message?.role === 'customer') return message.id
    }
    return ''
  }, [focusSession.messages])
  const enabledKey = enabledDocIds.join('|')

  useEffect(() => {
    void runPipeline({ retry: true })
    return () => {
      tokenRef.current += 1
    }
  }, [lastCustomerId, sessionEpoch, persona, activePersonaId, enabledKey, modelMode, runPipeline])

  const insertToWeChat = useCallback(async () => {
    const text = draftRef.current.trim()
    if (!text) return
    const host = window.zhida?.wechat
    if (host) {
      const result = await host.insertText(text)
      if (result.handled) {
        notify(result.reason)
        if (!result.ok) return
      }
    }
    await bridge.insertText(text)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* vibration is optional */
    }
  }, [bridge, notify])

  const sendSuggestion = useCallback(async () => {
    if (editing) return
    const text = committedRef.current.trim()
    if (!text) return
    const host = window.zhida?.wechat
    if (host) {
      const result = await host.sendText(text)
      if (result.handled) {
        notify(result.reason)
        if (!result.ok) return
      }
    }
    setSendState('sent')
    setWechatSending(true)
    await bridge.sendText(text)
    window.setTimeout(() => setWechatSending(false), 600)
    window.setTimeout(() => setSendState('idle'), 1200)
  }, [bridge, editing, notify])

  const sendComposer = useCallback(async () => {
    const text = bridge.getSnapshot().composerText.trim()
    if (!text) return
    setWechatSending(true)
    await bridge.sendText(text)
    window.setTimeout(() => setWechatSending(false), 600)
  }, [bridge])

  const copySuggestion = useCallback(async () => {
    const text = draftRef.current
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      if (!ok) {
        notify('复制失败，请手动选择文本')
        return
      }
    }
    setCopyState('copied')
    window.setTimeout(() => setCopyState('idle'), 1000)
  }, [notify])

  const selectVariant = useCallback((index: number) => {
    const text = variantsRef.current[index]
    if (!text) return
    setVariantIndex(index)
    setDraft(text)
    setCommitted(text)
    setEditing(false)
  }, [])

  const regenerate = useCallback(async () => {
    const list = variantsRef.current
    if (editing || phase !== 'ready' || list.length === 0 || regen) return
    const token = ++regenToken.current
    setRegen(true)
    await sleep(450)
    if (token !== regenToken.current) return
    const next = (indexRef.current + 1) % list.length
    const text = list[next] ?? ''
    setVariantIndex(next)
    setDraft(text)
    setCommitted(text)
    setBarEpoch((value) => value + 1)
    setRegen(false)
  }, [editing, phase, regen])

  const value: CompanionContextValue = {
    session,
    focusSession,
    hostDetail,
    echo,
    popId,
    phase,
    hits,
    draft,
    editing,
    dirty: editing && draft !== committed,
    intent,
    intentFlashKey,
    barEpoch,
    errorEpoch,
    variantIndex,
    variants,
    replyMode,
    variantCount: variants.length,
    regen,
    sendState,
    copyState,
    wechatSending,
    warning,
    provider,
    emptyReason,
    settingsOpen,
    setSettingsOpen,
    sourceHit: hits.find((hit) => hit.id === sourceId) ?? null,
    openSource: (id) => setSourceId(id),
    closeSource: () => setSourceId(null),
    expandedId,
    toggleExpanded: (id) => setExpandedId((current) => (current === id ? null : id)),
    theme,
    toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    persona,
    setPersona,
    personas: listPersonas(customPersonas),
    activePersonaId,
    selectPersona: (id) => {
      if (!listPersonas(customPersonas).some((item) => item.id === id)) return
      setActivePersonaId(id)
    },
    addPersona: () => {
      setCustomPersonas((current) => {
        if (current.length >= CUSTOM_PERSONA_LIMIT) return current
        const next: SavedPersona = { id: createPersonaId(), name: '自定义人设', prompt: '' }
        setActivePersonaId(next.id)
        return [...current, next]
      })
    },
    renamePersona: (id, name) => {
      const next = name.replace(/\s+/g, ' ').slice(0, 24)
      setCustomPersonas((current) => current.map((item) => (item.id === id ? { ...item, name: next } : item)))
    },
    updatePersonaPrompt: (id, prompt) => {
      setCustomPersonas((current) =>
        current.map((item) => (item.id === id ? { ...item, prompt: cleanPrompt(prompt) } : item)),
      )
    },
    deletePersona: (id) => {
      setCustomPersonas((current) => current.filter((item) => item.id !== id))
      setActivePersonaId((current) => (current === id ? 'support' : current))
    },
    docs: CORPUS.map((doc) => ({
      id: doc.id,
      title: doc.title,
      version: doc.version,
      enabled: enabledDocIds.includes(doc.id),
    })),
    toggleDoc: (id) =>
      setEnabledDocIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id])),
    modelMode,
    setModelMode,
    openaiBase,
    openaiModel,
    openaiKey,
    setOpenaiBase,
    setOpenaiModel,
    setOpenaiKey,
    rerun: () => void runPipeline({ retry: true }),
    setDraft,
    startEdit: () => setEditing(true),
    cancelEdit: () => {
      setDraft(committedRef.current)
      setEditing(false)
    },
    saveEdit: () => {
      setCommitted(draftRef.current)
      setEditing(false)
    },
    insertToWeChat: () => void insertToWeChat(),
    sendSuggestion: () => void sendSuggestion(),
    regenerate: () => void regenerate(),
    selectVariant,
    copySuggestion: () => void copySuggestion(),
    setComposerText: (text) => bridge.setComposerText(text),
    sendComposer: () => void sendComposer(),
    simulateCustomer: (text) => {
      bridge.appendCustomer(text)
      if (window.matchMedia('(max-width: 860px)').matches) setMobilePane('companion')
    },
    simulateError: () => void runPipeline({ fail: true }),
    resetSession: () => {
      forceErrorRef.current = false
      bridge.reset()
      setSearchOpen(false)
      setSearchQuery('')
      setSessionEpoch((value) => value + 1)
    },
    retry: () => void runPipeline({ retry: true }),
    toast,
    notify,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    mobilePane,
    setMobilePane,
    narrow,
  }

  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>
}

export function useCompanion() {
  const context = useContext(CompanionContext)
  if (!context) throw new Error('useCompanion must be used within CompanionProvider')
  return context
}
