import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import path from 'node:path'
import { boundsNearlyEqual, computeDockBounds } from '../src/dock/bounds.ts'
import { describeDock } from '../src/dock/status.ts'
import type { DockStatus } from '../src/dock/types.ts'
import type { HostBridgeStatus } from '../src/domain/wechat/hostTypes.ts'
import { indexLibraryFolder } from '../src/domain/knowledge/folderIndex.ts'
import { electronAccessibilityTrusted, promptForAccessibilityOnce } from './accessibility.ts'
import { findWeChatWindow } from './findWeChat.ts'
import { readModelKey, writeModelKey } from './modelKey.ts'
import { openPrivacyPane } from './openPrivacy.ts'
import { createWeChatHost } from './wechat/host.ts'

// Containers and some Linux desktops cannot install Chromium's setuid sandbox.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

const root = __dirname
const preferredWidth = 440
const dev = process.argv.includes('--dev')

let mainWindow: BrowserWindow | null = null
let moveLocks = 0
let pausedUntil = 0
let timer: ReturnType<typeof setInterval> | null = null
let ticking = false
const accessibilityName = process.platform === 'darwin' ? (app.isPackaged ? '智答助手' : 'Electron') : ''
let status: DockStatus = {
  mode: 'searching',
  platform: process.platform,
  detail: '正在查找微信窗口…',
  needsAccessibility: false,
  needsScreenRecording: false,
  accessibilityName,
}
const wechatHost = createWeChatHost()
let wechatStatus: HostBridgeStatus = {
  platform: process.platform,
  available: false,
  axTrusted: false,
  wechatRunning: false,
  dbReady: false,
  needsAccessibility: false,
  accessibilityName,
  detail: '正在检查微信…',
  session: null,
}
let wechatTimer: ReturnType<typeof setInterval> | null = null
let wechatTicking = false

function nameDock(next: DockStatus): DockStatus {
  const named = accessibilityName ? { ...next, accessibilityName } : next
  if (process.platform !== 'darwin' || !app.isPackaged) return named
  return { ...named, accessibilityStale: !electronAccessibilityTrusted() }
}

function publish(next: DockStatus) {
  const named = nameDock(next)
  if (
    named.mode === status.mode &&
    named.detail === status.detail &&
    named.side === status.side &&
    named.needsAccessibility === status.needsAccessibility &&
    named.needsScreenRecording === status.needsScreenRecording &&
    named.accessibilityName === status.accessibilityName &&
    named.accessibilityStale === status.accessibilityStale
  ) {
    return
  }
  status = named
  mainWindow?.webContents.send('dock:status', status)
  if (named.needsAccessibility) promptForAccessibilityOnce()
}

function publishWeChat(next: HostBridgeStatus) {
  const named = accessibilityName ? { ...next, accessibilityName } : next
  if (
    named.detail === wechatStatus.detail &&
    named.available === wechatStatus.available &&
    named.dbReady === wechatStatus.dbReady &&
    named.axTrusted === wechatStatus.axTrusted &&
    named.needsAccessibility === wechatStatus.needsAccessibility &&
    named.accessibilityName === wechatStatus.accessibilityName &&
    named.session?.id === wechatStatus.session?.id &&
    named.session?.messages.at(-1)?.id === wechatStatus.session?.messages.at(-1)?.id
  ) {
    return
  }
  wechatStatus = named
  mainWindow?.webContents.send('wechat:status', wechatStatus)
  if (named.needsAccessibility) promptForAccessibilityOnce()
}

async function pollWeChat() {
  if (wechatTicking) return
  wechatTicking = true
  try {
    publishWeChat(await wechatHost.poll())
  } catch {
    publishWeChat({ ...wechatStatus, detail: '检查微信时出错，演示窗仍可使用。' })
  } finally {
    wechatTicking = false
  }
}

function place(bounds: { x: number; y: number; width: number; height: number }) {
  if (!mainWindow) return
  if (boundsNearlyEqual(mainWindow.getBounds(), bounds)) return
  moveLocks += 1
  mainWindow.setBounds(bounds)
  setTimeout(() => {
    moveLocks = Math.max(0, moveLocks - 1)
  }, 300)
}

function centerFloating() {
  if (!mainWindow) return
  const area = screen.getPrimaryDisplay().workArea
  const [width, height] = mainWindow.getSize()
  place({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  })
}

async function tick() {
  if (!mainWindow || ticking) return
  ticking = true
  try {
    const found = await findWeChatWindow()
    if (!found.bounds) {
      const wasFloating = status.mode === 'floating'
      publish(
        describeDock({
          platform: process.platform,
          reason: found.reason,
          needsAccessibility: found.needsAccessibility,
        }),
      )
      if (!wasFloating) centerFloating()
      return
    }
    if (Date.now() < pausedUntil) return
    const display = screen.getDisplayNearestPoint({ x: found.bounds.x, y: found.bounds.y })
    const placement = computeDockBounds({
      host: found.bounds,
      workArea: display.workArea,
      preferredWidth,
    })
    place(placement)
    publish(describeDock({ platform: process.platform, reason: 'ok', side: placement.side }))
  } finally {
    ticking = false
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: preferredWidth,
    height: 780,
    minWidth: 380,
    minHeight: 560,
    show: false,
    center: true,
    title: '智答助手',
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(root, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = win
  win.setAlwaysOnTop(true, 'floating')
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.on('move', () => {
    if (moveLocks > 0 || status.mode !== 'docked') return
    pausedUntil = Date.now() + 1600
  })
  win.on('focus', () => {
    pausedUntil = 0
    void tick()
    void pollWeChat()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  win.once('ready-to-show', () => win.show())
  if (dev) void win.loadURL('http://127.0.0.1:43123')
  else void win.loadFile(path.join(root, '../dist/index.html'))
}

app.setName('智答助手')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    ipcMain.handle('dock:get-status', () => status)
    ipcMain.handle('dock:reattach', async () => {
      pausedUntil = 0
      await tick()
      return status
    })
    ipcMain.handle('accessibility:open-settings', () => openPrivacyPane('accessibility'))
    ipcMain.handle('screen:open-settings', () => openPrivacyPane('screen'))
    ipcMain.handle('wechat:get-status', () => wechatStatus)
    ipcMain.handle('wechat:insert', (_event, text: string) => wechatHost.insertText(String(text ?? '')))
    ipcMain.handle('wechat:send', (_event, text: string) => wechatHost.sendText(String(text ?? '')))
    ipcMain.handle('secret:get-model-key', () => readModelKey())
    ipcMain.handle('secret:set-model-key', (_event, key: string) => writeModelKey(String(key ?? '')))
    ipcMain.handle('library:pick', async (event, kind: string) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      const options = {
        title: kind === 'obsidian' ? '选择 Obsidian 库' : '选择知识文件夹',
        properties: ['openDirectory'] as Array<'openDirectory'>,
      }
      const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
      if (result.canceled) return ''
      return result.filePaths[0] ?? ''
    })
    ipcMain.handle('library:index', (_event, folder: string, kind: string) =>
      indexLibraryFolder(String(folder ?? ''), kind === 'obsidian' ? 'obsidian' : 'folder'),
    )
    createWindow()
    void tick()
    void pollWeChat()
    timer = setInterval(() => {
      void tick()
    }, 400)
    wechatTimer = setInterval(() => {
      void pollWeChat()
    }, 1200)
    screen.on('display-metrics-changed', () => {
      void tick()
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    if (timer) clearInterval(timer)
    if (wechatTimer) clearInterval(wechatTimer)
  })
}
