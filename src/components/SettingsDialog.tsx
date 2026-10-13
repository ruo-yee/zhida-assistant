import { useCompanion } from '../app/CompanionProvider.tsx'
import type { Persona } from '../domain/types.ts'
import { Button } from './ui/button.tsx'
import { Dialog, DialogContent } from './ui/dialog.tsx'

const PERSONAS: Array<{ id: Persona; title: string; detail: string }> = [
  { id: 'professional', title: '专业简明', detail: '先给结论，适合直接发到微信' },
  { id: 'warm', title: '亲切顾问', detail: '先接住问题，语气再软一点' },
  { id: 'technical', title: '技术细节', detail: '保留机制，并声明不补充库外数字' },
]

export function SettingsDialog() {
  const app = useCompanion()
  return (
    <Dialog open={app.settingsOpen} onOpenChange={app.setSettingsOpen}>
      <DialogContent title="设置" description="人设、知识库和模型只影响回复草稿，不会改写微信里的记录。">
        {window.zhida ? (
          <p className="hint">
            桌面窗口会贴在微信右侧，并跟着微信移动。macOS 需在「系统设置 → 隐私与安全性 → 辅助功能」里允许智答助手。知识库、草稿和密钥只留在本机。
          </p>
        ) : null}
        <h3>人设</h3>
        <div className="seg" role="radiogroup" aria-label="人设">
          {PERSONAS.map((persona) => (
            <button
              key={persona.id}
              type="button"
              role="radio"
              aria-checked={app.persona === persona.id}
              className={app.persona === persona.id ? 'is-on' : undefined}
              onClick={() => app.setPersona(persona.id)}
            >
              <strong>{persona.title}</strong>
              <small>{persona.detail}</small>
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
              <input value={app.openaiBase} onChange={(event) => app.setOpenaiBase(event.target.value)} />
            </label>
            <label className="field">
              <span>模型名</span>
              <input value={app.openaiModel} onChange={(event) => app.setOpenaiModel(event.target.value)} />
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
        <p className="hint">密钥只留在这台浏览器里。没填密钥，或接口失败时，自动改用本地草稿。</p>

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
