import type { DockStatus } from './dock/types.ts'
import type { FolderIndexResult } from './domain/knowledge/indexStatus.ts'
import type { HostActionResult, HostBridgeStatus } from './domain/wechat/hostTypes.ts'

declare global {
  interface Window {
    zhida?: {
      platform: string
      getDockStatus: () => Promise<DockStatus>
      reattach: () => Promise<DockStatus>
      openAccessibilitySettings: () => Promise<boolean>
      openScreenRecordingSettings: () => Promise<boolean>
      readModelKey: () => Promise<string>
      writeModelKey: (key: string) => Promise<void>
      pickLibraryFolder: (kind: 'folder' | 'obsidian') => Promise<string>
      indexLibrary: (folder: string, kind: 'folder' | 'obsidian') => Promise<FolderIndexResult>
      pathForDroppedFile: (file: unknown) => string
      classifyLibrary: (folder: string) => Promise<'folder' | 'obsidian' | 'unknown'>
      onDockStatus: (callback: (status: DockStatus) => void) => () => void
      wechat?: {
        getStatus: () => Promise<HostBridgeStatus>
        insertText: (text: string) => Promise<HostActionResult>
        sendText: (text: string) => Promise<HostActionResult>
        onStatus: (callback: (status: HostBridgeStatus) => void) => () => void
      }
    }
  }
}

export {}
