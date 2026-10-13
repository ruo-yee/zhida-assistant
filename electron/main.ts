import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'node:path'
import { boundsNearlyEqual, computeDockBounds } from '../src/dock/bounds.ts'
import { describeDock } from '../src/dock/status.ts'
import type { DockStatus } from '../src/dock/types.ts'
import { findWeChatWindow } from './findWeChat.ts'

// Containers and some Linux desktops cannot install Chromium's setuid sandbox.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-dev-shm-usage')
}

const root = __dirname
const preferredWidth = 440
const dev = process.argv.includes('--dev')

let mainWindow: BrowserWindow | null = null
let programmatic = false
let pausedUntil = 0
let timer: ReturnType<typeof setInterval> | null = null
let ticking = false
let status: DockStatus = {
  mode: 'searching',
  platform: process.platform,
  detail: '正在查找微信窗口…',
}

function publish(next: DockStatus) {
  if (next.mode === status.mode && next.detail === status.detail && next.side === status.side) return
  status = next
  mainWindow?.webContents.send('dock:status', status)
}

function place(bounds: { x: number; y: number; width: number; height: number }) {
  if (!mainWindow) return
  if (boundsNearlyEqual(mainWindow.getBounds(), bounds)) return
  programmatic = true
  mainWindow.setBounds(bounds)
  setTimeout(() => {
    programmatic = false
  }, 80)
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
      publish(describeDock({ platform: process.platform, reason: found.reason }))
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
    if (!programmatic && status.mode === 'docked') pausedUntil = Date.now() + 1600
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
    createWindow()
    void tick()
    timer = setInterval(() => {
      void tick()
    }, 400)
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
  })
}
