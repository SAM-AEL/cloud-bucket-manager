import { BrowserWindow, app, nativeTheme, session, shell } from 'electron'
import { join } from 'node:path'
import { initDataPaths, settings } from './store'
import { registerIpc } from './ipc/handlers'
import { invalidateAllClients } from './s3/client'
import { warmUpKeychain } from './secrets'

const isDev = !app.isPackaged
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL

let mainWindow: BrowserWindow | null = null

/**
 * Content Security Policy. In production the renderer is loaded from file://
 * and may only load its own assets; in dev we additionally allow the Vite
 * dev server and its websocket for HMR.
 */
function applyCsp(): void {
  const csp = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  // Nothing in this app needs camera, mic, geolocation or notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
}

function createWindow(): BrowserWindow {
  const saved = settings.get().window

  const win = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    // Matches --color-canvas in index.css so there is no flash on launch.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#232322' : '#f6f6f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#00000000',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#c9c9c6' : '#3c3c3a',
            // Must match the TitleBar component's h-12.
            height: 48
          }
        }
      : {}),
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 16 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Core Electron security posture.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false
    }
  })

  // Avoid a white flash: show only once the renderer has painted.
  win.once('ready-to-show', () => {
    if (saved?.maximized) win.maximize()
    win.show()
  })

  // Persist geometry so the app reopens where the user left it.
  const persistBounds = (): void => {
    if (!win || win.isDestroyed() || win.isMinimized()) return
    const bounds = win.getNormalBounds()
    settings.patch({
      window: {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: win.isMaximized()
      }
    })
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)
  win.on('maximize', persistBounds)
  win.on('unmaximize', persistBounds)

  // No in-app navigation: this is a local-only surface. External https links
  // are handed to the OS browser rather than opened inside the app.
  win.webContents.on('will-navigate', (event, url) => {
    if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return
    event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })

  return win
}

// A single instance keeps one set of credentials and one transfer queue.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    initDataPaths()
    await warmUpKeychain()

    // Reflect the persisted theme preference at the OS level.
    const theme = settings.get().theme
    nativeTheme.themeSource = theme === 'system' ? 'system' : theme

    applyCsp()
    registerIpc()

    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Tear down SDK connection pools so the process can exit cleanly.
  invalidateAllClients()
})
