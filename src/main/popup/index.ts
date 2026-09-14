import { BrowserWindow, dialog, ipcMain, screen, type IpcMainEvent } from 'electron'
import { stat } from 'fs/promises'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { readSettings, writeSettings, type SettingsConfs } from './schema'
import { configDir } from '../util'
import type {
  PopupInit,
  PopupMessageOptions,
  PopupMode,
  PopupPromptOptions,
  PopupSettingsOptions,
  SettingsData
} from './types'

const BAND_MIN_HEIGHT = 56
const BAND_MAX_HEIGHT = 96
const PANEL_WIDTH = 760
const PANEL_HEIGHT = 600
const EDGE_GAP = 8

type Bounds = { x: number; y: number; width: number; height: number }

// 独立弹窗模块: 无边框透明置顶窗, 覆写阅读条(band)或锚定浮层(panel)
export class PopupManager {
  private readonly mainWindow: BrowserWindow
  private readonly confs: SettingsConfs
  private readonly windows = new Set<BrowserWindow>()

  constructor({ mainWindow, conf }: { mainWindow: BrowserWindow; conf: SettingsConfs }) {
    this.mainWindow = mainWindow
    this.confs = conf
    this.registerSettingsHandlers()
    log.info('PopupManager ==> ready')
  }

  public error(options: Omit<PopupMessageOptions, 'type'>): Promise<number> {
    return this.message({ ...options, type: 'error' })
  }

  public message(options: PopupMessageOptions): Promise<number> {
    const buttons = options.buttons?.length ? options.buttons : ['确定']
    const cancelId = options.cancelId ?? buttons.length - 1
    return this.open<number>({ mode: 'message', options: { ...options, buttons } }, cancelId)
  }

  public prompt(options: PopupPromptOptions): Promise<string | null> {
    return this.open<string | null>({ mode: 'prompt', options }, null)
  }

  public settings(options: PopupSettingsOptions = {}): Promise<void> {
    return this.open<void>({ mode: 'settings', options, data: readSettings(this.confs) }, undefined)
  }

  public dispose(): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.destroy()
    }
    this.windows.clear()
  }

  private open<T>(init: PopupInit, cancelValue: T): Promise<T> {
    return new Promise<T>((resolve) => {
      log.debug(`open ${init.mode}: ${JSON.stringify(init)}`)
      const win = this.createWindow(init.mode)
      this.windows.add(win)

      let settled = false
      const settle = (value: T): void => {
        if (settled) return
        settled = true
        cleanup()
        this.windows.delete(win)
        if (!win.isDestroyed()) win.destroy()
        resolve(value)
      }

      const onResolve = (event: IpcMainEvent, payload: unknown): void => {
        if (event.sender !== win.webContents) return
        settle(payload as T)
      }
      const onCancel = (event: IpcMainEvent): void => {
        if (event.sender !== win.webContents) return
        settle(cancelValue)
      }
      const onResize = (event: IpcMainEvent, height: number): void => {
        if (event.sender !== win.webContents) return
        this.growWindow(win, height)
      }
      const cleanup = (): void => {
        ipcMain.removeListener('popup:resolve', onResolve)
        ipcMain.removeListener('popup:cancel', onCancel)
        ipcMain.removeListener('popup:resize', onResize)
      }

      ipcMain.on('popup:resolve', onResolve)
      ipcMain.on('popup:cancel', onCancel)
      ipcMain.on('popup:resize', onResize)

      win.webContents.on('did-finish-load', () => {
        win.webContents.send('popup:init', init)
      })
      // 窗口被系统关闭(非按钮)时按取消处理
      win.on('closed', () => settle(cancelValue))
    })
  }

  private createWindow(mode: PopupMode): BrowserWindow {
    const bounds = this.computeBounds(mode)
    const win = new BrowserWindow({
      ...bounds,
      parent: this.mainWindow,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/popup.js'),
        sandbox: false
      }
    })
    // 需盖过同为置顶的阅读条
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setMenu(null)
    win.on('ready-to-show', () => win.show())

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popup.html`).then(undefined)
    } else {
      win.loadFile(join(__dirname, '../renderer/popup.html')).then(undefined)
    }
    return win
  }

  private computeBounds(mode: PopupMode): Bounds {
    const main = this.mainWindow.getBounds()
    const workArea = screen.getDisplayMatching(main).workArea

    if (mode === 'settings') {
      const width = Math.min(PANEL_WIDTH, workArea.width - EDGE_GAP * 2)
      const height = Math.min(PANEL_HEIGHT, workArea.height - EDGE_GAP * 2)
      const x = this.clamp(
        main.x + Math.round((main.width - width) / 2),
        workArea.x + EDGE_GAP,
        workArea.x + workArea.width - width - EDGE_GAP
      )
      // 优先贴在阅读条下方, 空间不足则翻到上方, 再不够就居中
      let y = main.y + main.height + EDGE_GAP
      if (y + height > workArea.y + workArea.height) y = main.y - EDGE_GAP - height
      if (y < workArea.y) y = workArea.y + Math.round((workArea.height - height) / 2)
      return { x, y, width, height }
    }

    const height = Math.min(Math.max(main.height, BAND_MIN_HEIGHT), BAND_MAX_HEIGHT)
    const width = Math.min(main.width, workArea.width)
    const y = this.clamp(
      main.y + Math.round((main.height - height) / 2),
      workArea.y,
      workArea.y + workArea.height - height
    )
    return { x: main.x, y, width, height }
  }

  // 内容超出时只增高(向下), 避免与渲染进程测量形成抖动
  private growWindow(win: BrowserWindow, height: number): void {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    const next = this.clamp(
      Math.ceil(height),
      bounds.height,
      workArea.y + workArea.height - bounds.y
    )
    if (next <= bounds.height) return
    win.setBounds({ ...bounds, height: next })
  }

  private registerSettingsHandlers(): void {
    ipcMain.handle('popup:config-dir', () => configDir)
    ipcMain.handle('popup:settings:read', () => readSettings(this.confs))
    ipcMain.handle('popup:settings:write', (_event, patch: SettingsData) =>
      writeSettings(this.confs, patch)
    )
    ipcMain.handle('popup:settings:pick-file', async (_event, options?: { title?: string }) => {
      const { canceled, filePaths } = await dialog.showOpenDialog(this.mainWindow, {
        title: options?.title ?? '选择阅读文件',
        properties: ['openFile'],
        filters: [
          {
            name: '文本文档',
            extensions: ['txt']
          },
          {
            name: 'Epub 电子书',
            extensions: ['epub']
          }
        ]
      })
      return canceled || filePaths.length === 0 ? null : filePaths[0]
    })
    ipcMain.handle(
      'popup:settings:validate-file',
      async (_event, filePath: string): Promise<boolean> => {
        try {
          const fileStat = await stat(filePath)
          return fileStat.isFile()
        } catch {
          return false
        }
      }
    )
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max))
  }
}
