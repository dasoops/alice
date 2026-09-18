import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import path from 'node:path'
import { error } from '../util'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import type { Book, BookEvents, Chapter } from './book'
import { createParser } from './parser'
import { WebDavClient } from '../webdav'
import { ProgressSync, type SyncTrigger } from './sync/sync'
import { compareProgress, type BookProgress, type SyncMode } from './sync/progress'
import EventEmitter from 'node:events'
import { Config } from './config'
import type { PopupManager } from '../popup'

export class Reader extends EventEmitter<BookEvents> {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly webdav: WebDavClient
  private readonly popup: PopupManager
  private readonly progressSync: ProgressSync
  private readonly mode: SyncMode
  public initlization: Promise<void>
  // 已弹窗确认/静默跳过的远端进度快照; 用户忽略后, 相同远端的重复同步不再打扰
  private promptedRemote?: BookProgress
  private _book?: Book

  constructor({
    conf,
    mainWindow,
    webdav,
    popup
  }: {
    conf: Conf<Config>
    mainWindow: BrowserWindow
    webdav: WebDavClient
    popup: PopupManager
  }) {
    super()
    this.conf = conf
    this.mainWindow = mainWindow
    this.webdav = webdav
    this.popup = popup
    this.mode = conf.get('sync')?.mode ?? 'approximate'
    this.progressSync = new ProgressSync({
      mode: this.mode,
      webdav: this.webdav
    })

    this.initlization = this.init()
  }

  public async book(): Promise<Book> {
    await this.initlization
    if (!this._book) throw Error('unexpected')
    return this._book
  }

  public async chapter(): Promise<Chapter> {
    return (await this.book()).chapter()
  }

  public async setFile(path: string): Promise<void> {
    if (!path) throw Error('无效文件路径')
    const previous = this.conf.get('file')
    this.conf.set('file', path)
    this.conf.reset('position')
    this.promptedRemote = undefined
    // 解析可能较慢(epub 解压), 先通知渲染进程展示 loading, 避免停留在旧书
    this.mainWindow.webContents.send('loading')
    try {
      await this.load(path)
    } catch (err) {
      // 解析失败(如 epub 无正文章节)回滚文件配置, 保持旧书, 阻止切换
      this.conf.set('file', previous)
      this.mainWindow.webContents.send('loading-hide')
      error(`无法打开书籍: ${path}`)
      log.warn(`Reader ==> 打开书籍失败: ${err}`)
      return
    }
    this.mainWindow.webContents.send('refresh-content')
  }

  private async init(): Promise<void> {
    log.info(`Reader ==> init, conf: ${JSON.stringify(this.conf.store)}`)

    // 先注册 handler, 避免书籍解析(大 epub 可能较慢)期间渲染进程调用 read 报未注册
    ipcMain.handle('reader:read', async (_, offset: number): Promise<string> => {
      log.debug('on reader:read')
      return await this.read(offset)
    })
    ipcMain.handle('reader:fileName', (): string => path.basename(this.conf.get('file')))

    try {
      await this.load(this.conf.get('file'))
    } catch (err) {
      // 初始书籍解析失败(如 epub 无正文章节)回退默认文本, 避免应用无法启动
      log.warn(`Reader ==> 初始书籍加载失败, 回退默认文本: ${err}`)
      this.conf.set('file', Config.Default.file)
      await this.load(Config.Default.file)
    }
    // hide 仅推送(远端领先时静默跳过)
    this.mainWindow.on('hide', () => this.fireSync({ pull: false, push: true }))
    // show 完整同步(窗口可见时可弹恢复确认)
    this.mainWindow.on('show', () => this.fireSync({ pull: true, push: true }))
    this.on('chapter', () => this.fireSync({ pull: true, push: true }))
    this.fireSync({ pull: true, push: true })
    log.info(`Reader <== init ok.`)
  }

  private async load(filePath: PathLike): Promise<void> {
    if (!fs.existsSync(filePath)) {
      filePath = Config.Default.file
      fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')
    }

    this._book = await createParser(String(filePath), this.conf).parse()
    // 转发 book 章节事件, 供 tray 重建菜单与进度同步使用
    this._book.on('chapter', (chapter: Chapter, previous: Chapter | undefined) => {
      this.emit('chapter', chapter, previous)
    })
    this._book.setPosition(this.conf.get('position'))
  }

  async read(offset: number): Promise<string> {
    const book = await this.book()
    const { maxLine, chunkSize } = this.conf.store
    log.debug(`Reader ==> position: ${JSON.stringify(book.position())}`)

    const string = book.readPage(offset, { maxLine, chunkSize })
    log.debug(`Reader ==> ${string}`)
    this.conf.set('position', book.position())

    return string
  }

  async lines(): Promise<{ current: number; total: number }> {
    const book = await this.book()
    if (!book.lines) {
      error('仅文本文件支持行号')
      throw Error('仅文本文件支持行号')
    }
    return book.lines()
  }

  async jumpLine(value: number): Promise<void> {
    const book = await this.book()
    const index = book.jumpLine?.(value)
    if (index === undefined) {
      error('指定行数不存在')
      return
    }
    this.conf.set('position', book.position())
    this.mainWindow.webContents.send('refresh-content')
  }

  async jumpChapter(index: number, position: number = 0): Promise<void> {
    const book = await this.book()
    book.setPosition({ chapterIndex: index, chapterPos: position })
    this.conf.set('position', book.position())
    this.mainWindow.webContents.send('refresh-content')
  }

  // 触发一次同步, 失败仅记日志不阻塞阅读
  private fireSync(trigger: SyncTrigger): void {
    this.sync(trigger).catch((err) => {
      log.warn(`WebDavSync ==> sync failed: ${err}`)
    })
  }

  // before-quit 时调用, await 完成, 仅推送不弹恢复确认
  public async flush(): Promise<void> {
    try {
      await this.sync({ pull: false, push: true })
    } catch (err) {
      log.warn(`WebDavSync ==> flush failed: ${err}`)
    }
  }

  private async sync(trigger: SyncTrigger): Promise<void> {
    const book = await this.book()

    const remote = await this.progressSync.sync(book, () => this.localProgress(book), trigger)
    if (!remote) return

    // 已就同一远端进度弹过窗(用户忽略), 不重复打扰; 远端变化时重新弹窗
    if (this.promptedRemote && compareProgress(this.mode, remote, this.promptedRemote) === 0) {
      return
    }
    this.promptedRemote = remote

    // 远端 durChapterIndex 为 legado 侧 index, 翻译为本地章节 index
    const chapterIndex = this.toLocalIndex(book, remote.durChapterIndex)
    // 本地没有对应章节: 不弹恢复确认, 静默失败并记录错误
    if (chapterIndex === undefined) {
      log.error('WebDavSync ==> 本地章节表未覆盖远端进度, 跳过恢复: ' + JSON.stringify(remote))
      return
    }

    const response = await this.popup.message({
      type: 'question',
      title: 'WebDav 同步',
      message: '远端阅读进度领先, 是否恢复?',
      detail: `远端进度: ${remote.durChapterTitle}`,
      buttons: ['恢复远端进度', '忽略']
    })
    if (response !== 0) return

    // chapter 模式仅恢复章节信息, 跳转到章节头
    log.info('WebDavSync ==> 同步远端进度')
    await this.jumpChapter(chapterIndex, this.mode === 'chapter' ? 0 : remote.durChapterPos)
  }

  // 远端 durChapterIndex 为 legado 侧 index, 翻译为本地章节 index;
  // 本地章节 legadoIndex 为空表示无对应远端目录章节, 不参与匹配; 整体无匹配时返回 undefined
  private toLocalIndex(book: Book, legadoIndex: number): number | undefined {
    return book.chapters.find((chapter) => chapter.legadoIndex === legadoIndex)?.index
  }

  private localProgress(book: Book): BookProgress {
    // 当前章由 book 内部随定位维护, 即当前定位所在章节;
    // 首章前或 toc 为空时为 undefined, 此时回退 0 值进度
    const position = book.position()
    const chapter = book.chapter()
    return {
      name: book.name,
      author: book.author,
      // legadoIndex 由 parser 按 legado 章节表换算; 空白前言等 legado 无对应章节时回退本地 index
      durChapterIndex: chapter.legadoIndex ?? position.chapterIndex,
      durChapterPos: this.mode === 'chapter' ? 0 : position.chapterPos,
      durChapterTime: Date.now(),
      durChapterTitle: chapter.title
    }
  }
}
