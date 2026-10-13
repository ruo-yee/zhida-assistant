import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DockStatus } from '../src/dock/types.ts'
import type { HostActionResult, HostBridgeStatus } from '../src/domain/wechat/hostTypes.ts'

contextBridge.exposeInMainWorld('zhida', {
  platform: process.platform,
  getDockStatus: (): Promise<DockStatus> => ipcRenderer.invoke('dock:get-status'),
  reattach: (): Promise<DockStatus> => ipcRenderer.invoke('dock:reattach'),
  openAccessibilitySettings: (): Promise<boolean> => ipcRenderer.invoke('accessibility:open-settings'),
  openScreenRecordingSettings: (): Promise<boolean> => ipcRenderer.invoke('screen:open-settings'),
  onDockStatus: (callback: (status: DockStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: DockStatus) => callback(status)
    ipcRenderer.on('dock:status', listener)
    return () => {
      ipcRenderer.removeListener('dock:status', listener)
    }
  },
  wechat: {
    getStatus: (): Promise<HostBridgeStatus> => ipcRenderer.invoke('wechat:get-status'),
    insertText: (text: string): Promise<HostActionResult> => ipcRenderer.invoke('wechat:insert', text),
    sendText: (text: string): Promise<HostActionResult> => ipcRenderer.invoke('wechat:send', text),
    onStatus: (callback: (status: HostBridgeStatus) => void) => {
      const listener = (_event: IpcRendererEvent, status: HostBridgeStatus) => callback(status)
      ipcRenderer.on('wechat:status', listener)
      return () => {
        ipcRenderer.removeListener('wechat:status', listener)
      }
    },
  },
})
