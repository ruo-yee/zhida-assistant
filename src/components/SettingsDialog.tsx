import { useCompanion } from '../app/CompanionProvider.tsx'
import { cleanName, CUSTOM_PERSONA_LIMIT } from '../domain/reply/personas.ts'
import type { Persona } from '../domain/types.ts'
import { Button } from './ui/button.tsx'
import { Dialog, DialogContent } from './ui/dialog.tsx'

const TONES: Array<{ id: Persona; title: string; detail: string }> = [
  { id: 'professional', title: '专业简明', detail: '先给结论，适合直接发到微信' },
  { id: 'warm', title: '亲切顾问', detail: '先接住问题，语气再软一点' },
  { id: 'technical', title: '技术细节', detail: '保留机制，并声明不补充库外数字' },
]

export function SettingsDialog() {
  const app = useCompanion()
  const active = app.personas.find((item) => item.id === app.activePersonaId)
  const customCount = app.personas.filter((item) => !item.builtin).length
  return (
    <Dialog open={app.settingsOpen} onOpenChange={app.setSettingsOpen}>
      <DialogContent title="设置" description="角色和语气只改回复草稿。插入到微信和一键发送都要你再点一次。">
        {window.zhida ? (
          <p className="hint">
            桌面窗口会贴在微信右侧，并跟着微信移动。macOS 需在「系统设置 → 隐私与安全性 → 辅助功能」里允许智答助手，才能读取当前会话并写入输入框。数据库密钥放在本机 keys.json，程序只读打开，不会写回微信。
          </p>
        ) : null}
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

        <h3>知识库</h3>
        {app.docs.map((doc) => (
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
        ))}

        <h3>模型</h3>
        <div className="mode-seg" role="radiogroup" aria-label="回复来源">
          <button
            type="button"
            role="radio"
            aria-checked={app.modelMode === 'local'}
            className={app.modelMode === 'local' ? 'is-on' : undefined}
            onClick={() => app.setModelMode('local')}
          >
            本地草稿
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={app.modelMode === 'openai'}
            className={app.modelMode === 'openai' ? 'is-on' : undefined}
            onClick={() => app.setModelMode('openai')}
          >
            OpenAI 兼容
          </button>
        </div>
        {app.modelMode === 'openai' ? (
          <>
            <label className="field">
              <span>接口地址</span>
              <input
                value={app.openaiBase}
                placeholder="http://127.0.0.1:11434/v1"
                onChange={(event) => app.setOpenaiBase(event.target.value)}
              />
            </label>
            <label className="field">
              <span>模型名</span>
              <input
                value={app.openaiModel}
                placeholder="qwen2.5:7b"
                onChange={(event) => app.setOpenaiModel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>密钥</span>
              <input
                type="password"
                autoComplete="off"
                value={app.openaiKey}
                onChange={(event) => app.setOpenaiKey(event.target.value)}
              />
            </label>
          </>
        ) : null}
        <p className="hint">
          {app.modelMode === 'local'
            ? '当前使用本地草稿，不访问网络。要让人设由模型来写，切换到「OpenAI 兼容」。'
            : 'Ollama 示例：地址 http://127.0.0.1:11434/v1 ，模型名用本机已拉取的名字（如 qwen2.5:7b），密钥留空。其它兼容接口同样填写，需要鉴权时再写密钥。密钥只留在这台电脑上。地址为空或接口失败时，改回本地草稿。'}
        </p>

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

        <div className="sheet-actions">
          <Button
            variant="outline"
            onClick={() => {
              app.setSettingsOpen(false)
            }}
          >
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
      </DialogContent>
    </Dialog>
  )
}
