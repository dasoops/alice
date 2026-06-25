import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Conf } from 'electron-conf'
import { Config as ReaderConfig, Reader } from './reader'
import { Config as ShortcutConfig, ShortcutManager } from './shortcut'
import log from 'electron-log/main'
import { configDir } from './util'
import { TrayManager } from './tray'
import { Store } from './store'

export type WindowConfig = {
  penetrate: boolean
  width: number
  height: number
  x?: number
  y?: number
}

const WindowConfig: { Default: WindowConfig } = {
  Default: { penetrate: true, width: 800, height: 80, x: undefined, y: undefined }
}

function registerConfig(): {
  window: Conf<WindowConfig>
  reader: Conf<ReaderConfig>
  shortcut: Conf<ShortcutConfig>
} {
  const extra = { dir: configDir }
  return {
    window: new Conf<WindowConfig>({
      name: 'window',
      defaults: WindowConfig.Default,
      ...extra
    }),
    reader: new Conf<ReaderConfig>({
      name: 'reader',
      defaults: ReaderConfig.Default,
      ...extra
    }),
    shortcut: new Conf<ShortcutConfig>({
      name: 'shortcut',
      defaults: ShortcutConfig.Default,
      ...extra
    })
  }
}

function createWindow({ conf, store }: { conf: Conf<WindowConfig>; store: Store }): BrowserWindow {
  const boundsConfig = {
    ...conf.store,
    penetrate: undefined
  }
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    ...boundsConfig,
    frame: false, // 无边框
    transparent: true, // 透明背景
    alwaysOnTop: true, // 悬浮窗
    skipTaskbar: true, // 不显示在任务栏
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // ctrl + w 不关闭窗口
  // @see: https://stackoverflow.com/questions/60350520/electron-browser-window-prevent-controlw-closing-window
  mainWindow.setMenu(null)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then(undefined)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).then(undefined)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then(undefined)
  }

  const changePenetrate = (lock: boolean, penetrate: boolean): void => {
    mainWindow.setIgnoreMouseEvents(lock ? penetrate : false)
  }

  conf.onDidChange('penetrate', (penetrate) => {
    if (undefined === penetrate) throw Error('unexpected')
    changePenetrate(store.lock, penetrate)
  })
  store.on('lock', (lock) => {
    if (undefined === lock) throw Error('unexpected')
    changePenetrate(lock, conf.get('penetrate'))
  })
  changePenetrate(store.lock, conf.get('penetrate'))

  ipcMain.on('toggle-display', () => {
    log.debug('on toggle-display')
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })
  ipcMain.on('error', async (options) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const optionsAny = options as any
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: optionsAny.title || '错误',
      message: optionsAny.message || '发生错误',
      buttons: ['确定']
    })
  })
  return mainWindow
}

const instanceLock = app.requestSingleInstanceLock()
if (!instanceLock) {
  app.quit()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  log.initialize()
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.dasoops')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const conf = registerConfig()
  app.on('before-quit', () => {
    conf.window.set(mainWindow.getBounds())
  })

  const store = new Store()

  const mainWindow = createWindow({ conf: conf.window, store: store })

  const reader = new Reader({
    conf: conf.reader,
    mainWindow: mainWindow
  })

  const ipcSend =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channel: string, ...args: any[]): void => {
      log.debug(`ipcSend ==> ${channel}`)
      mainWindow.webContents.send(channel, args)
    }
  const toggleDisplay = (): void => {
    store.display = !store.display
    ipcMain.emit('toggle-display', { display: store.display })
  }
  const toggleLock = (): void => {
    store.lock = !store.lock
    ipcSend('toggle-lock', { lock: store.lock })
  }
  const shortcutManager = new ShortcutManager({
    conf: conf.shortcut,
    handler: {
      toggleDisplay: toggleDisplay,
      toggleLock: toggleLock,
      prevPage: () => ipcSend('prev-page'),
      nextPage: () => ipcSend('next-page'),
      exit: app.quit
    }
  })
  const trayManager = new TrayManager({
    conf: { reader: conf.reader, window: conf.window },
    reader: reader,
    mainWindow: mainWindow,
    handler: {
      toggleDisplay: toggleDisplay,
      exit: app.quit
    }
  })
  for (const it of [reader, shortcutManager, trayManager]) {
    await it.initlization
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
