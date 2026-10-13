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
import { describeLibrary, type IndexFailure, type IndexPhase } from '../domain/knowledge/indexStatus.ts'
import { createKnowledgeRetriever } from '../domain/knowledge/KnowledgeRetriever.ts'
import { isDroppedTextFile, libraryDropPlan, noteFromDroppedText } from '../domain/knowledge/libraryDrop.ts'
import { LOCAL_NOTE_LIMIT, retrievalLibrary, type KnowledgeSource, type LocalNote } from '../domain/knowledge/library.ts'
import { focusForHost } from '../domain/wechat/liveSession.ts'
import { rememberOutbound, turnsWithOutbound, type PendingOutbound } from '../domain/reply/chatContext.ts'
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
import { SETTINGS_VERSION, loadSettings, persistableSettings, saveSettings, type ModelMode, type ThemeName } from './settings.ts'
import type { SettingsSection } from './settingsSections.ts'

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
  settingsSection: SettingsSection
  setSettingsOpen: (open: boolean) => void
  openSettings: (section?: SettingsSection) => void
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
  keyStoredSecurely: boolean
  knowledgeSource: KnowledgeSource
  setKnowledgeSource: (source: KnowledgeSource) => void
  folderPath: string
  obsidianPath: string
  setLibraryPath: (value: string) => void
  libraryStatus: { tone: 'ok' | 'wait' | 'warn'; text: string }
  chooseLibraryFolder: () => void
  savedNoteCount: number
  saveMessage: (text: string) => void
  acceptLibraryDrop: (transfer: DataTransfer) => Promise<void>
  showDemo: boolean
  toggleDemo: () => void
  pendingSend: { text: string; target: 'wechat' | 'demo' } | null
  cancelSend: () => void
  confirmSend: () => void
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
  const [settingsOpen, setSettingsOpenState] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('model')
  const setSettingsOpen = useCallback((open: boolean) => {
    if (open) setSettingsSection('model')
    setSettingsOpenState(open)
  }, [])
  const openSettings = useCallback((section: SettingsSection = 'model') => {
    setSettingsSection(section)
    setSettingsOpenState(true)
  }, [])
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
  const [knowledgeSource, setKnowledgeSource] = useState(boot.knowledgeSource)
  const [folderPath, setFolderPath] = useState(boot.folderPath)
  const [obsidianPath, setObsidianPath] = useState(boot.obsidianPath)
  const [libraryFiles, setLibraryFiles] = useState<Array<{ id: string; title: string; body: string }>>([])
  const [savedNotes, setSavedNotes] = useState<LocalNote[]>([])
  const [libraryPhase, setLibraryPhase] = useState<IndexPhase>('idle')
  const [libraryCode, setLibraryCode] = useState<IndexFailure | null>(null)
  const [showDemo, setShowDemo] = useState(() => !window.zhida)
  const [pendingSend, setPendingSend] = useState<{ text: string; via: 'suggestion' | 'composer'; target: 'wechat' | 'demo' } | null>(null)
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
    knowledgeSource,
    folderPath,
    obsidianPath,
    libraryFiles,
    savedNotes,
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
  const outboundRef = useRef<PendingOutbound[]>([])
  const seenCustomer = useRef<string | null>(null)

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
      knowledgeSource,
      folderPath,
      obsidianPath,
      libraryFiles,
      savedNotes,
    }
    draftRef.current = draft
    committedRef.current = committed
    variantsRef.current = variants
    indexRef.current = variantIndex
  }, [persona, activePersonaId, customPersonas, enabledDocIds, modelMode, openaiBase, openaiModel, openaiKey, knowledgeSource, folderPath, obsidianPath, libraryFiles, savedNotes, draft, committed, variants, variantIndex])

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
    const read = window.zhida?.readModelKey
    if (!read) return
    void read().then((key) => {
      if (key) setOpenaiKey(key)
      else if (boot.openaiKey) void window.zhida?.writeModelKey(boot.openaiKey)
    })
  }, [boot.openaiKey])

  useEffect(() => {
    if (knowledgeSource === 'builtin') {
      setLibraryFiles([])
      setLibraryPhase('idle')
      setLibraryCode(null)
      return
    }
    const folder = knowledgeSource === 'obsidian' ? obsidianPath : folderPath
    if (!folder.trim()) {
      setLibraryFiles([])
      setLibraryPhase('idle')
      setLibraryCode(null)
      return
    }
    const index = window.zhida?.indexLibrary
    if (!index) {
      setLibraryFiles([])
      setLibraryPhase('desktop')
      setLibraryCode(null)
      return
    }
    let cancel = false
    setLibraryPhase('loading')
    void index(folder, knowledgeSource).then((result) => {
      if (cancel) return
      if (!result.ok) {
        setLibraryFiles([])
        setLibraryCode(result.code)
        setLibraryPhase(result.code === 'empty' ? 'empty' : 'error')
        return
      }
      setLibraryFiles(result.files)
      setLibraryCode(null)
      setLibraryPhase('ready')
    })
    return () => {
      cancel = true
    }
  }, [knowledgeSource, folderPath, obsidianPath])

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

  const focusSession = focusForHost(tracked, session, typeof window !== 'undefined' && Boolean(window.zhida))
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
    const secureKey = Boolean(window.zhida?.writeModelKey)
    saveSettings(
      persistableSettings(
        {
          theme,
          persona,
          activePersonaId,
          customPersonas,
          enabledDocIds,
          knowledgeSource,
          folderPath,
          obsidianPath,
          modelMode,
          openaiBase,
          openaiModel,
          openaiKey,
          settingsVersion: SETTINGS_VERSION,
        },
        secureKey,
      ),
    )
    if (secureKey) void window.zhida?.writeModelKey(openaiKey)
    document.documentElement.dataset.theme = theme
  }, [theme, persona, activePersonaId, customPersonas, enabledDocIds, knowledgeSource, folderPath, obsidianPath, modelMode, openaiBase, openaiModel, openaiKey])

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
        const merged = turnsWithOutbound(active.id, active.messages, outboundRef.current)
        outboundRef.current = merged.pending
        const customer = active.messages.filter((message) => message.role === 'customer')
        const latest = customer.at(-1)?.text ?? ''
        if (fail) {
          await wait()
          if (token !== tokenRef.current) return
          throw new Error('retrieval failed')
        }
        const enabled = settingsRef.current.enabledDocIds
        const library = retrievalLibrary({
          source: settingsRef.current.knowledgeSource,
          files: settingsRef.current.libraryFiles,
          notes: settingsRef.current.savedNotes,
          enabledDocIds: enabled,
        })
        const found = await createKnowledgeRetriever(library.docs).search({
          messages: customer.slice(-4).map((message) => ({ role: message.role, text: message.text })),
          enabledDocIds: library.enabledDocIds,
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
          turns: merged.turns,
          grounding,
          hits: found,
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

  const noteOutbound = useCallback(
    (text: string) => {
      const active = trackedRef.current ?? bridge.getSnapshot()
      outboundRef.current = rememberOutbound(outboundRef.current, {
        sessionId: active.id,
        anchorId: active.messages.at(-1)?.id ?? '',
        text,
      })
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
  const libraryKey = `${knowledgeSource}:${libraryPhase}:${libraryFiles.length}:${savedNotes.map((note) => note.id).join(',')}`

  useEffect(() => {
    void runPipeline({ retry: true })
    return () => {
      tokenRef.current += 1
    }
  }, [focusSession.id, lastCustomerId, sessionEpoch, persona, activePersonaId, enabledKey, libraryKey, modelMode, runPipeline])

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
    noteOutbound(text)
    await bridge.insertText(text)
    try {
      navigator.vibrate?.(12)
    } catch {
      /* vibration is optional */
    }
  }, [bridge, noteOutbound, notify])

  const deliverSend = useCallback(
    async (text: string, via: 'suggestion' | 'composer') => {
      if (via === 'suggestion') {
        const host = window.zhida?.wechat
        if (host) {
          const result = await host.sendText(text)
          if (result.handled) {
            notify(result.reason)
            if (!result.ok) return
          }
        }
        noteOutbound(text)
        setSendState('sent')
        setWechatSending(true)
        await bridge.sendText(text)
        window.setTimeout(() => setWechatSending(false), 600)
        window.setTimeout(() => setSendState('idle'), 1200)
        return
      }
      setWechatSending(true)
      await bridge.sendText(text)
      window.setTimeout(() => setWechatSending(false), 600)
    },
    [bridge, noteOutbound, notify],
  )

  const sendSuggestion = useCallback(() => {
    if (editing) return
    const text = committedRef.current.trim()
    if (!text) return
    setPendingSend({ text, via: 'suggestion', target: window.zhida?.wechat ? 'wechat' : 'demo' })
  }, [editing])

  const sendComposer = useCallback(() => {
    const text = bridge.getSnapshot().composerText.trim()
    if (!text) return
    setPendingSend({ text, via: 'composer', target: 'demo' })
  }, [bridge])

  const cancelSend = useCallback(() => setPendingSend(null), [])

  const confirmSend = useCallback(() => {
    const pending = pendingSend
    setPendingSend(null)
    if (!pending) return
    void deliverSend(pending.text, pending.via)
  }, [deliverSend, pendingSend])

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
    settingsSection,
    setSettingsOpen,
    openSettings,
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
    keyStoredSecurely: Boolean(window.zhida?.writeModelKey),
    knowledgeSource,
    setKnowledgeSource,
    folderPath,
    obsidianPath,
    setLibraryPath: (value: string) => {
      if (knowledgeSource === 'obsidian') setObsidianPath(value)
      else setFolderPath(value)
    },
    libraryStatus: describeLibrary({
      source: knowledgeSource,
      enabledCount: enabledDocIds.length,
      phase: libraryPhase,
      fileCount: libraryFiles.length,
      code: libraryCode,
      fallback: knowledgeSource !== 'builtin' && libraryFiles.length === 0,
    }),
    savedNoteCount: savedNotes.length,
    saveMessage: (text: string) => {
      const note = noteFromDroppedText('会话摘录', text)
      if (!note) return
      const title = text.replace(/\s+/g, ' ').trim().slice(0, 18) || '会话摘录'
      setSavedNotes((current) => [{ ...note, title }, ...current].slice(0, LOCAL_NOTE_LIMIT))
      notify('已整理进知识库')
    },
    acceptLibraryDrop: async (transfer: DataTransfer) => {
      const files = [...transfer.files]
      for (const file of files) {
        const droppedPath = window.zhida?.pathForDroppedFile?.(file) ?? ''
        if (!droppedPath || !window.zhida?.classifyLibrary) continue
        const kind = await window.zhida.classifyLibrary(droppedPath).catch(() => 'unknown' as const)
        const plan = libraryDropPlan({ path: droppedPath, kind })
        if (plan.action !== 'switch') continue
        setKnowledgeSource(plan.source)
        if (plan.source === 'obsidian') setObsidianPath(plan.path)
        else setFolderPath(plan.path)
        notify(plan.source === 'obsidian' ? '已改用这个 Obsidian 库' : '已改用这个文件夹')
        return
      }
      const notes: LocalNote[] = []
      for (const file of files) {
        if (!isDroppedTextFile(file.name)) continue
        const note = noteFromDroppedText(file.name, await file.text())
        if (note) notes.push(note)
      }
      if (!notes.length) {
        notify('请拖入文件夹、Obsidian 库，或 Markdown / 文本')
        return
      }
      setSavedNotes((current) => [...notes, ...current].slice(0, LOCAL_NOTE_LIMIT))
      notify(`已加入知识库 ${notes.length} 篇`)
    },
    chooseLibraryFolder: () => {
      const pick = window.zhida?.pickLibraryFolder
      if (!pick || knowledgeSource === 'builtin') return
      void pick(knowledgeSource).then((folder) => {
        if (!folder) return
        if (knowledgeSource === 'obsidian') setObsidianPath(folder)
        else setFolderPath(folder)
      })
    },
    showDemo,
    toggleDemo: () => setShowDemo((value) => !value),
    pendingSend: pendingSend ? { text: pendingSend.text, target: pendingSend.target } : null,
    cancelSend,
    confirmSend,
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
      const mockId = bridge.getSnapshot().id
      outboundRef.current = outboundRef.current.filter((item) => item.sessionId !== mockId)
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
