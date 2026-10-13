import { useCompanion } from '../app/CompanionProvider.tsx'
import { Button } from './ui/button.tsx'
import { Dialog, DialogContent } from './ui/dialog.tsx'

export function SendConfirm() {
  const app = useCompanion()
  const pending = app.pendingSend
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) app.cancelSend() }}>
      {pending ? (
        <DialogContent
          title="确认发送"
          description={
            pending.target === 'wechat'
              ? '这句话会发到当前微信会话。发送前可以再看一眼。'
              : '这句话会发到演示窗，不是你的微信。'
          }
        >
          <p className="confirm-preview">{pending.text}</p>
          <div className="sheet-actions">
            <Button variant="outline" onClick={app.cancelSend}>
              取消
            </Button>
            <Button onClick={app.confirmSend}>发送</Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
