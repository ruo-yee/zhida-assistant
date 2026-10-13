import { X } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCompanion } from '../app/CompanionProvider.tsx'
import { MODEL_PAGE_FIELDS, SETTINGS_SECTIONS, type ModelPageFieldId } from '../app/settingsSections.ts'
import { GATEKEEPER_NOTE } from '../domain/wechat/accessibilityCopy.ts'
import { CHAT_CONTEXT_LIMIT } from '../domain/reply/chatContext.ts'
import { cleanName, CUSTOM_PERSONA_LIMIT } from '../domain/reply/personas.ts'
import type { Persona } from '../domain/types.ts'
import { Button } from './ui/button.tsx'

const TONES: Array<{ id: Persona; title: string; detail: string }> = [
  { id: 'professional', title: '专业简明', detail: '先给结论，适合直接发到微信' },
  { id: 'warm', title: '亲切顾问', detail: '先接住问题，语气再软一点' },
  { id: 'technical', title: '技术细节', detail: '保留机制，并声明不补充库外数字' },
]

export function SettingsPage() {
  const app = useCompanion()
  const { setSettingsOpen } = app
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSettingsOpen])

  const onTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const index = SETTINGS_SECTIONS.findIndex((item) => item.id === app.settingsSection)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % SETTINGS_SECTIONS.length
    if (event.key === 'ArrowLeft') next = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = SETTINGS_SECTIONS.length - 1
    const id = SETTINGS_SECTIONS[next]?.id
    if (!id) return
    app.openSettings(id)
    requestAnimationFrame(() => document.getElementById(`settings-tab-${id}`)?.focus())
  }

  return (
    <div className="settings-page">
      <div className="settings-head">
        <div>
          <h2>设置</h2>
          <p>大模型的接口地址、API Key 和模型名保存在这台电脑上。</p>
        </div>
        <button type="button" className="icon-btn" aria-label="关闭设置" onClick={() => app.setSettingsOpen(false)}>
          <X size={16} />
        </button>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="设置分类" onKeyDown={onTabsKeyDown}>
        {SETTINGS_SECTIONS.map((item) => {
          const selected = app.settingsSection === item.id
          return (
            <button
              key={item.id}
              id={`settings-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`settings-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'is-on' : undefined}
              onClick={() => app.openSettings(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      <div
        role="tabpanel"
        id={`settings-panel-${app.settingsSection}`}
        aria-labelledby={`settings-tab-${app.settingsSection}`}
      >
        {app.settingsSection === 'model' ? <ModelSettings /> : null}
        {app.settingsSection === 'persona' ? <PersonaSettings /> : null}
        {app.settingsSection === 'knowledge' ? <KnowledgeSettings /> : null}
        {app.settingsSection === 'look' ? <LookSettings /> : null}
      </div>
      <div className="sheet-actions">
        <Button variant="outline" onClick={() => app.setSettingsOpen(false)}>
          关闭
        </Button>
        <Button
          onClick={() => {
            app.setSettingsOpen(false)
            app.rerun()
          }}
        >
          重新检索
        </Button>
      </div>
    </div>
  )
}

function ModelSettings() {
  const app = useCompanion()
  const [showKey, setShowKey] = useState(false)
  const endpoint = app.openaiBase.trim() || '未填写'
  const modelName = app.openaiModel.trim() || '未填写'
  return (
    <>
      <h3>大模型</h3>
      <p className="hint">
        填写 OpenAI 兼容接口。回复会把当前微信会话最近 {CHAT_CONTEXT_LIMIT} 条消息当作上下文发给这个地址。改完即写进本机，不用另存。
      </p>
      <div className="doc-row">
        <span className="name">用大模型写回复</span>
        <button
          type="button"
          role="switch"
          aria-checked={app.modelMode === 'openai'}
          aria-label="用大模型写回复"
          className={app.modelMode === 'openai' ? 'switch is-on' : 'switch'}
          onClick={() => app.setModelMode(app.modelMode === 'openai' ? 'local' : 'openai')}
        />
      </div>
      <ModelFields showKey={showKey} onToggleKey={() => setShowKey((value) => !value)} />
      <p className="settings-status">
        {app.modelMode === 'openai'
          ? `当前接口 ${endpoint} · 模型 ${modelName} · 上下文最近 ${CHAT_CONTEXT_LIMIT} 条`
          : '已改用本地草稿，不会访问上面的地址。地址和密钥仍保存在本机。'}
      </p>
      <p className="hint">
        {app.modelMode === 'openai' && !app.openaiBase.trim()
          ? '接口地址是空的，暂时不会请求模型。'
          : `程序请求的是 {接口地址}/chat/completions，所以地址要带到 /v1。本机 Ollama 一般是 http://127.0.0.1:11434/v1，API Key 留空。知识摘录只在对得上时另附，不叫上下文。连不上时改用本地草稿。不会自动发送。`}
      </p>
    </>
  )
}

function ModelFields({ showKey, onToggleKey }: { showKey: boolean; onToggleKey: () => void }) {
  const app = useCompanion()
  const values: Record<ModelPageFieldId, string> = {
    base: app.openaiBase,
    key: app.openaiKey,
    model: app.openaiModel,
  }
  const setters: Record<ModelPageFieldId, (value: string) => void> = {
    base: app.setOpenaiBase,
    key: app.setOpenaiKey,
    model: app.setOpenaiModel,
  }
  return (
    <>
      {MODEL_PAGE_FIELDS.map((field) => (
        <div className="field" key={field.id}>
          <label htmlFor={`model-${field.id}`}>{field.label}</label>
          {field.kind === 'secret' ? (
            <span id="model-key-note" className="field-note">
              {app.keyStoredSecurely
                ? '可选。本机 Ollama 留空。桌面版用系统加密保存在本机，不写入页面存储，也不会上传。'
                : '可选。本机 Ollama 留空。浏览器演示只能写在这台电脑的本地存储里，不会上传。'}
            </span>
          ) : null}
          <div className={field.kind === 'secret' ? 'field-secret' : undefined}>
            <input
              id={`model-${field.id}`}
              type={field.kind === 'secret' && !showKey ? 'password' : 'text'}
              inputMode={field.kind === 'url' ? 'url' : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder={field.placeholder}
              aria-describedby={field.kind === 'secret' ? 'model-key-note' : undefined}
              value={values[field.id]}
              onChange={(event) => setters[field.id](event.target.value)}
            />
            {field.kind === 'secret' ? (
              <button type="button" className="field-reveal" aria-pressed={showKey} onClick={onToggleKey}>
                {showKey ? '隐藏' : '显示'}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </>
  )
}

function PersonaSettings() {
  const app = useCompanion()
  const active = app.personas.find((item) => item.id === app.activePersonaId)
  const customCount = app.personas.filter((item) => !item.builtin).length
  return (
    <>
      <h3>人设</h3>
      <div className="persona-list" role="radiogroup" aria-label="人设">
        {app.personas.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={app.activePersonaId === item.id}
            className={app.activePersonaId === item.id ? 'persona-row is-on' : 'persona-row'}
            onClick={() => app.selectPersona(item.id)}
          >
            <strong>{item.name || '未命名人设'}</strong>
            <small>{item.builtin ? item.detail : '自定义'}</small>
          </button>
        ))}
      </div>
      {active ? (
        active.builtin ? (
          <p className="persona-note">{active.prompt}</p>
        ) : (
          <>
            <label className="field">
              <span>名称</span>
              <input
                value={active.name}
                maxLength={24}
                onChange={(event) => app.renamePersona(active.id, event.target.value)}
                onBlur={() => {
                  if (!active.name.trim()) app.renamePersona(active.id, cleanName(''))
                }}
              />
            </label>
            <label className="field">
              <span>人设说明</span>
              <textarea
                value={active.prompt}
                maxLength={2000}
                placeholder="例如：你是行业顾问。回复短、具体，先复述对方的目标，再给一步可执行的建议。"
                onChange={(event) => app.updatePersonaPrompt(active.id, event.target.value)}
              />
            </label>
            <div className="persona-actions">
              <Button variant="outline" size="sm" onClick={() => app.deletePersona(active.id)}>
                删除此人设
              </Button>
            </div>
          </>
        )
      ) : null}
      <div className="persona-actions">
        <Button variant="outline" size="sm" disabled={customCount >= CUSTOM_PERSONA_LIMIT} onClick={app.addPersona}>
          添加人设
        </Button>
      </div>
      <p className="hint">预设不能改。自定义的名称和说明保存在这台电脑上。改完说明后点「重新检索」，当前人设会用于闲聊和有摘录的回复。</p>
      <h3>语气</h3>
      <div className="seg" role="radiogroup" aria-label="语气">
        {TONES.map((tone) => (
          <button
            key={tone.id}
            type="button"
            role="radio"
            aria-checked={app.persona === tone.id}
            className={app.persona === tone.id ? 'is-on' : undefined}
            onClick={() => app.setPersona(tone.id)}
          >
            <strong>{tone.title}</strong>
            <small>{tone.detail}</small>
          </button>
        ))}
      </div>
    </>
  )
}

const SOURCES = [
  { id: 'builtin' as const, title: '内置', detail: '随应用附带' },
  { id: 'folder' as const, title: '本地文件夹', detail: 'Markdown 和文本' },
  { id: 'obsidian' as const, title: 'Obsidian', detail: '一个库文件夹' },
]

function KnowledgeSettings() {
  const app = useCompanion()
  const external = app.knowledgeSource !== 'builtin'
  const path = app.knowledgeSource === 'obsidian' ? app.obsidianPath : app.folderPath
  return (
    <>
      <h3>知识库</h3>
      <p className="hint">
        知识摘录可以附在回复后面。它不是上下文，上下文仍是当前微信会话里的对话。把文件夹、Obsidian 库或 Markdown 拖进助手面板，会立刻并入检索。
      </p>
      <div className="seg" role="radiogroup" aria-label="知识来源">
        {SOURCES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={app.knowledgeSource === item.id}
            className={app.knowledgeSource === item.id ? 'is-on' : undefined}
            onClick={() => app.setKnowledgeSource(item.id)}
          >
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </button>
        ))}
      </div>
      {external ? (
        <>
          <label className="field">
            <span>{app.knowledgeSource === 'obsidian' ? 'Obsidian 库' : '文件夹'}</span>
            <input
              value={path}
              placeholder={app.knowledgeSource === 'obsidian' ? '含 .obsidian 的库路径' : '含 Markdown 或文本的文件夹'}
              onChange={(event) => app.setLibraryPath(event.target.value)}
            />
          </label>
          <div className="persona-actions">
            <Button variant="outline" size="sm" disabled={!window.zhida} onClick={app.chooseLibraryFolder}>
              选择文件夹
            </Button>
          </div>
          <p className={app.libraryStatus.tone === 'ok' ? 'settings-status' : 'hint'} role="status">
            {app.libraryStatus.text}
          </p>
          {app.libraryStatus.tone !== 'ok' ? <p className="hint">回复仍用内置知识库。</p> : null}
        </>
      ) : (
        app.docs.map((doc) => (
          <div className="doc-row" key={doc.id}>
            <span className="name">{doc.title}</span>
            <span className="ver">{doc.version}</span>
            <button
              type="button"
              role="switch"
              aria-checked={doc.enabled}
              aria-label={`${doc.enabled ? '关闭' : '打开'} ${doc.title}`}
              className={doc.enabled ? 'switch is-on' : 'switch'}
              onClick={() => app.toggleDoc(doc.id)}
            />
          </div>
        ))
      )}
    </>
  )
}

function LookSettings() {
  const app = useCompanion()
  return (
    <>
      <h3>外观</h3>
      <div className="doc-row">
        <span className="name">深色模式</span>
        <button
          type="button"
          role="switch"
          aria-checked={app.theme === 'dark'}
          aria-label="深色模式"
          className={app.theme === 'dark' ? 'switch is-on' : 'switch'}
          onClick={app.toggleTheme}
        />
      </div>
      {window.zhida ? (
        <>
          <h3>辅助功能</h3>
          <p className="hint">
            贴边或写入输入框需要授权时，点下面的按钮即可打开系统设置。打包后的列表名是「智答助手」，开发运行时是「Electron」。允许后会自动继续。
          </p>
          <div className="persona-actions">
            <Button variant="outline" size="sm" onClick={() => void window.zhida?.openAccessibilitySettings()}>
              打开辅助功能设置
            </Button>
          </div>
          <p className="hint">{GATEKEEPER_NOTE}</p>
        </>
      ) : null}
    </>
  )
}
