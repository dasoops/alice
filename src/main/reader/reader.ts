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
import type { BookProgress, SyncMode } from './sync/progress'
import EventEmitter from 'node:events'
import { Config } from './config'

export class Reader extends EventEmitter<BookEvents> {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly webdav: WebDavClient
  private readonly progressSync: ProgressSync
  private readonly mode: SyncMode
  public initlization: Promise<void>
  private warnedNoChapter = false
  private _book?: Book

  constructor({
    conf,
    mainWindow,
    webdav
  }: {
    conf: Conf<Config>
    mainWindow: BrowserWindow
    webdav: WebDavClient
  }) {
    super()
    this.conf = conf
    this.mainWindow = mainWindow
    this.webdav = webdav
    this.mode = conf.get('sync')?.mode ?? 'approximate'
    this.progressSync = new ProgressSync({
      mode: this.mode,
      webdav: this.webdav,
      mainWindow: mainWindow
    })

    this.initlization = this.init()
  }

  public async book(): Promise<Book> {
    await this.initlization
    if (!this._book) throw Error('unexpected')
    return this._book
  }

  public async chapter(): Promise<Chapter | undefined> {
    return (await this.book()).chapter()
  }

  public async setFile(path: string): Promise<void> {
    if (!path) throw Error('无效文件路径')
    this.conf.set('file', path)
    this.conf.reset('position')
    this.progressSync.reset()
    await this.load(path)
    this.mainWindow.webContents.send('refresh-content')
  }

  private async init(): Promise<void> {
    log.info(`Reader ==> init, conf: ${JSON.stringify(this.conf.store)}`)

    await this.load(this.conf.get('file'))
    ipcMain.handle('reader:read', async (_, offset: number): Promise<string> => {
      log.debug('on reader:read')
      return await this.read(offset)
    })
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
      // epub 缺失时无法生成占位文件, 回退默认文本文件避免启动崩溃
      if (path.extname(String(filePath)).toLowerCase() === '.epub') {
        error('Epub 文件不存在, 已回退到默认文本文件')
        filePath = Config.Default.file
      }
      fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')
    }

    this._book = await createParser(String(filePath), this.conf).parse()
    // 转发 book 章节事件, 供 tray 重建菜单与进度同步使用
    this._book.on('chapter', (chapter: Chapter | undefined, previous: Chapter | undefined) => {
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
    if (book.chapters.length === 0) {
      error('未识别到章节')
      return
    }
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
    const chapters = book.chapters
    if (chapters.length === 0) {
      if (!this.warnedNoChapter) {
        this.warnedNoChapter = true
        error('章节表为空, WebDav 同步已禁用')
      }
      return
    }

    const remote = await this.progressSync.sync(book, () => this.localProgress(book), trigger)
    if (!remote) return

    // chapter 模式仅恢复章节信息, 跳转到章节头
    log.info('WebDavSync ==> 同步远端进度')
    const position = this.mode === 'chapter' ? 0 : remote.durChapterPos
    await this.jumpChapter(remote.durChapterIndex, position)
  }

  private localProgress(book: Book): BookProgress {
    // 当前章由 book 内部随定位维护, 即当前定位所在章节;
    // 首章前或 toc 为空时为 undefined, 此时回退 0 值进度
    const position = book.position()
    const chapter = book.chapter()
    return {
      name: book.name,
      author: book.author,
      durChapterIndex: position.chapterIndex,
      durChapterPos: this.mode === 'chapter' || !chapter ? 0 : position.chapterPos,
      durChapterTime: Date.now(),
      durChapterTitle: chapter?.title ?? ''
    }
  }
}
