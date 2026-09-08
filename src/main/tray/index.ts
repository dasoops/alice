import { BrowserWindow, dialog, Menu, shell, Tray } from 'electron'
import icon from './../../../resources/icon.png?asset'
import { Conf } from 'electron-conf'
import { configDir, error } from '../util'
import { Config as ReaderConfig, Reader } from '../reader'
import path from 'path'
import log from 'electron-log/main'
import prompt from 'electron-prompt'
import { WindowConfig } from '../index'

export type Handler = {
  toggleDisplay: () => void
  exit: () => void
}

export class TrayManager {
  private readonly conf: { reader: Conf<ReaderConfig>; window: Conf<WindowConfig> }
  private readonly reader: Reader
  private readonly mainWindow: BrowserWindow
  private readonly handler: Handler

  public initlization: Promise<void>

  private tray?: Tray

  constructor({
    conf,
    reader,
    mainWindow,
    handler
  }: {
    conf: { reader: Conf<ReaderConfig>; window: Conf<WindowConfig> }
    reader: Reader
    mainWindow: BrowserWindow
    handler: Handler
  }) {
    this.conf = conf
    this.reader = reader
    this.mainWindow = mainWindow
    this.handler = handler

    this.initlization = this.init()
  }

  private async init(): Promise<void> {
    log.info(`TrayManager ==> init`)
    await this.create0()

    this.mainWindow.on('show', () => this.create())
    this.mainWindow.on('hide', () => this.destroy())
    log.info(`TrayManager ==> init ok`)
  }

  async create(): Promise<void> {
    await this.initlization
    await this.create0()
  }

  private async create0(): Promise<void> {
    log.info(`TrayManager ==> create`)
    if (this.tray) return
    this.tray = new Tray(icon)
    this.tray.setToolTip('Alice')
    this.tray.on('click', this.handler.toggleDisplay)

    const chapters = await this.reader.chapters()
    const currentChapterIndex = await this.reader.currentChapterIndex()
    const chapterItems = chapters.map((it) => {
      // 章节标题超 40 字符截断
      const label = it.title.length > 40 ? `${it.title.substring(0, 40)}…` : it.title
      return {
        label: label,
        type: 'checkbox' as const,
        checked: it.index === currentChapterIndex,
        click: (): void => {
          this.jumpChapter(it.index).then(null)
        }
      }
    })

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '跳转行数', click: () => this.showJumpDialog() },
        {
          label: '跳转章节',
          enabled: chapterItems.length > 0,
          submenu: chapterItems.length > 0 ? chapterItems : undefined
        },
        { label: '选择阅读文件', click: () => this.showSelectFileDialog() },
        { label: '打开阅读文件', click: () => this.openReadFile() },
        { label: '打开阅读文件缓存', click: () => this.openReadFileCache() },
        { label: '打开阅读文件目录', click: () => this.openReadFileDir() },
        { type: 'separator' },
        { label: '打开快捷键配置文件', click: () => this.openShortcutConfigFile() },
        { label: '打开配置目录', click: () => this.openConfigDir() },
        { type: 'separator' },
        {
          type: 'checkbox',
          label: '鼠标点击穿透',
          click: ({ checked }) => this.togglePenetrate(checked).then(null),
          checked: this.conf.window.get('penetrate')
        },
        { label: '退出', click: () => this.handler.exit() }
      ])
    )
  }

  async destroy(): Promise<void> {
    await this.initlization
    this.destroy0()
  }

  private destroy0(): void {
    log.info(`TrayManager ==> destroy`)
    this.tray?.destroy()
    this.tray = undefined
  }

  async openReadFile(): Promise<void> {
    await this.initlization
    await shell.openPath(this.conf.reader.get('file'))
  }

  async openReadFileCache(): Promise<void> {
    await this.initlization
    await shell.openPath(this.reader.cachePath!)
  }

  async openReadFileDir(): Promise<void> {
    await this.initlization
    await shell.openPath(path.dirname(this.conf.reader.get('file')))
  }

  async openShortcutConfigFile(): Promise<void> {
    await this.initlization
    await shell.openPath(path.resolve(configDir, 'shortcut.json'))
  }

  async openConfigDir(): Promise<void> {
    await this.initlization
    await shell.openPath(configDir)
  }

  async jumpChapter(index: number): Promise<void> {
    await this.initlization
    await this.reader.jumpChapter(index)
  }

  async showJumpDialog(): Promise<void> {
    await this.initlization

    const currentLine = await this.reader.currentLine()
    const totalLine = await this.reader.totalLine()
    const pageInput = await prompt(
      {
        icon: icon,
        title: `选择页码`,
        label: `请输入缓存文件行号 (1 - ${totalLine})`,
        value: currentLine.toString(),
        inputAttrs: {
          type: 'number',
          min: '0',
          max: totalLine.toString()
        },
        type: 'input',
        width: 440,
        height: 200
      },
      this.mainWindow
    )

    if (!pageInput) return
    const pageNumber = parseInt(pageInput)
    if (isNaN(pageNumber)) {
      error('页码无效')
      return
    }
    await this.reader.jumpPage(pageNumber)
  }

  async showSelectFileDialog(): Promise<void> {
    await this.initlization

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择阅读文件',
      properties: ['openFile'],
      filters: [
        {
          name: '文本文档',
          extensions: ['txt']
        },
        {
          name: 'Alice 缓存文件',
          extensions: ['cache']
        }
      ]
    })
    if (canceled) return
    this.conf.reader.set('file', filePaths[0])
  }

  async togglePenetrate(value: boolean): Promise<void> {
    await this.initlization
    this.conf.window.set('penetrate', value)
  }
}
