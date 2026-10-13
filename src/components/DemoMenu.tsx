import { useCompanion } from '../app/CompanionProvider.tsx'
import { DEMO_PROMPTS } from '../domain/wechat/seed.ts'
import { MenuItem, MenuLabel } from './ui/dropdown.tsx'

export function DemoMenuItems() {
  const app = useCompanion()
  return (
    <>
      <MenuLabel>演示 · 非官方客户端</MenuLabel>
      {DEMO_PROMPTS.map((prompt) => (
        <MenuItem key={prompt.id} onSelect={() => app.simulateCustomer(prompt.text)}>
          {prompt.label}
        </MenuItem>
      ))}
      <MenuItem onSelect={app.simulateError}>检索失败</MenuItem>
      <MenuItem onSelect={app.resetSession}>重置会话</MenuItem>
    </>
  )
}
