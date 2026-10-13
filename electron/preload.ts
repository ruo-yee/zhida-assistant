import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { DockStatus } from '../src/dock/types.ts'

contextBridge.exposeInMainWorld('zhida', {
  platform: process.platform,
  getDockStatus: (): Promise<DockStatus> => ipcRenderer.invoke('dock:get-status'),
  reattach: (): Promise<DockStatus> => ipcRenderer.invoke('dock:reattach'),
  onDockStatus: (callback: (status: DockStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: DockStatus) => callback(status)
    ipcRenderer.on('dock:status', listener)
    return () => {
      ipcRenderer.removeListener('dock:status', listener)
    }
  },
})
