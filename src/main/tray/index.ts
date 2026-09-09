import { BrowserWindow, dialog, Menu, shell, Tray } from 'electron'
import icon from './../../../resources/icon.png?asset'
import { Conf } from 'electron-conf'
import { configDir, error } from '../util'
import { Config as ReaderConfig, Reader } from '../reader'
import { Config as WebDavConfig } from '../webdav'
import path from 'path'
import log from 'electron-log/main'
import prompt from 'electron-prompt'
import { WindowConfig } from '../index'

export type Handler = {
  toggleDisplay: () => void
  exit: () => void
}

export class TrayManager {
  private readonly conf: {
    reader: Conf<ReaderConfig>
    window: Conf<WindowConfig>
    webdav: Conf<WebDavConfig>
  }
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
    conf: {
      reader: Conf<ReaderConfig>
      window: Conf<WindowConfig>
      webdav: Conf<WebDavConfig>
    }
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

    // 章节变化(菜单点击/快捷键/翻页跨章等)时重建菜单,
    this.reader.on('chapter', () => this.refreshContextMenu())
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

    await this.reader.initlization
    this.refreshContextMenu()
  }

  private refreshContextMenu(): void {
    if (!this.tray) return
    this.tray.setContextMenu(this.buildMenu())
  }

  private buildMenu(): Menu {
    const chapter = this.reader.chapter
    const chapters = this.reader.chapters
    const chapterItems = chapters.map((it) => {
      // 章节标题超 20 字符截断
      const label = it.title.length > 20 ? `${it.title.substring(0, 20)}…` : it.title
      return {
        label: label,
        type: 'checkbox' as const,
        checked: it.index === chapter?.index,
        click: (): void => {
          this.jumpChapter(it.index).then(null)
        }
      }
    })

    return Menu.buildFromTemplate([
      { label: '跳转行数', click: () => this.showJumpDialog() },
      {
        label: '跳转章节',
        enabled: chapterItems.length > 0,
        submenu: chapterItems.length > 0 ? chapterItems : undefined
      },
      {
        label: '跳转章节号',
        enabled: chapterItems.length > 0,
        click: () => this.showJumpChapterDialog()
      },
      { type: 'separator' },
      { label: '选择阅读文件', click: () => this.showSelectFileDialog() },
      { label: '打开阅读文件', click: () => this.openReadFile() },
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
      {
        type: 'checkbox',
        label: 'WebDav 同步',
        click: ({ checked }) => this.toggleSync(checked).then(null),
        checked: this.conf.webdav.get('enabled')
      },
      { label: '退出', click: () => this.handler.exit() }
    ])
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
    await this.reader.jumpLine(pageNumber)
  }

  async showJumpChapterDialog(): Promise<void> {
    await this.initlization
    await this.reader.initlization

    const chapters = this.reader.chapters
    if (chapters.length === 0) {
      error('未识别到章节')
      return
    }

    // 序号从 0 开始, 与跳转章节 tray 子菜单的 toc index 一致(含前言为 0)
    const current = Math.max(this.reader.chapter?.index ?? -1, 0)
    const maxChapterInedx = chapters.length - 1
    const chapterInput = await prompt(
      {
        icon: icon,
        title: `选择章节`,
        label: `请输入章节序号 (0 - ${maxChapterInedx})`,
        value: current.toString(),
        inputAttrs: {
          type: 'number',
          min: '0',
          max: maxChapterInedx.toString()
        },
        type: 'input',
        width: 440,
        height: 200
      },
      this.mainWindow
    )

    if (!chapterInput) return
    const chapterIndex = parseInt(chapterInput)
    if (isNaN(chapterIndex) || chapterIndex < 0 || chapterIndex >= chapters.length) {
      error('章节序号无效')
      return
    }
    await this.reader.jumpChapter(chapterIndex)
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

  async toggleSync(value: boolean): Promise<void> {
    await this.initlization
    const { url, username, password } = this.conf.webdav.store
    if (value && (!url || !username || !password)) {
      // 不写入 enabled, 重建菜单复位勾选显示
      this.refreshContextMenu()
      error('请先在 webdav.json 配置 url/username/password')
      return
    }
    this.conf.webdav.set('enabled', value)
  }
}
