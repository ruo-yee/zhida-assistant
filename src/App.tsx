import { CompanionProvider, useCompanion } from './app/CompanionProvider.tsx'
import { CompanionPane } from './components/CompanionPane.tsx'
import { SourceDialog } from './components/SourceDialog.tsx'
import { SendConfirm } from './components/SendConfirm.tsx'
import { WeChatPane } from './components/WeChatPane.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'

export default function App() {
  return (
    <TooltipProvider>
      <CompanionProvider>
        <Shell />
      </CompanionProvider>
    </TooltipProvider>
  )
}

function Shell() {
  const app = useCompanion()
  return (
    <div className="desk flex h-dvh min-h-0 flex-col">
      {app.narrow ? (
        <div className="mobile-switch" role="tablist" aria-label="窗口">
          <button
            type="button"
            role="tab"
            aria-selected={app.mobilePane === 'wechat'}
            className={app.mobilePane === 'wechat' ? 'is-on' : undefined}
            onClick={() => app.setMobilePane('wechat')}
          >
            演示窗
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={app.mobilePane === 'companion'}
            className={app.mobilePane === 'companion' ? 'is-on' : undefined}
            onClick={() => app.setMobilePane('companion')}
          >
            智答助手
          </button>
        </div>
      ) : null}
      <div className="stage flex min-h-0 flex-1">
        <WeChatPane hidden={app.narrow ? app.mobilePane !== 'wechat' : !app.showDemo} />
        <CompanionPane hidden={app.narrow && app.mobilePane !== 'companion'} />
      </div>
      <SendConfirm />
      <SourceDialog />
      {app.toast ? (
        <div className="toast" role="status">
          {app.toast}
        </div>
      ) : null}
    </div>
  )
}
