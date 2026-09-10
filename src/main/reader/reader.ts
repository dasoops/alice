import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import { error } from '../util'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import { compileRegexes } from './txt/toc'
import type { Book, Chapter, Position } from './book'
import { createParser } from './parser'
import { WebDavClient } from '../webdav'
import { ProgressSync } from './sync/sync'
import EventEmitter from 'node:events'
import type { Config } from './config'

export class Reader extends EventEmitter {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly webdav: WebDavClient
  public readonly progressSync: ProgressSync
  public initlization: Promise<void>
  // load 完成前为空, 外部须先 await book()
  public _book?: Book
  // 当前章节; 首章前或 toc 为空时为 undefined, 外部须先 await chapter()
  public _chapter?: Chapter

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
    this.progressSync = new ProgressSync({
      mode: conf.get('sync')?.mode ?? 'approximate',
      reader: this,
      webdav: this.webdav,
      mainWindow: mainWindow
    })

    this.initlization = this.init()
  }

  // 外部规范访问入口, 保证 initlization 完成后返回已加载的书
  public async book(): Promise<Book> {
    await this.initlization
    if (!this._book) throw Error('unexpected')
    return this._book
  }

  // 当前章节规范访问入口, 保证 initlization 完成后返回确定值(首章前或 toc 空时为 undefined)
  public async chapter(): Promise<Chapter | undefined> {
    await this.initlization
    return this._chapter
  }

  private async init(): Promise<void> {
    log.info(`Reader ==> init, conf: ${JSON.stringify(this.conf.store)}`)

    await this.load(this.conf.get('file'))
    this.refreshChapter()
    this.conf.onDidChange('position', (newValue) => {
      if (!newValue || typeof newValue !== 'object') throw Error('unexpected')
      this._book?.setPosition(newValue as Position)
      this.refreshChapter()
    })
    this.conf.onDidChange('file', async (newValue) => {
      if (!newValue) throw Error('unexpected')
      // clear
      this.conf.reset('position')
      await this.load(newValue as string)
      // load 重建了 toc, 以新 toc 重算当前章节, 避免残留旧书的章节
      this.refreshChapter()
      this.mainWindow.webContents.send('refresh-content')
    })
    ipcMain.handle('reader:read', async (_, offset: number): Promise<string> => {
      log.debug('on reader:read')
      return await this.read(offset)
    })
    log.info(`Reader <== init ok.`)
  }

  // 重算当前章节, 跨章时 emit 'chapter'; 首章前或 toc 为空时 chapter 为 undefined
  private refreshChapter(): void {
    const previous = this._chapter
    const current = this._book?.currentChapter()
    if (current?.index === previous?.index) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }

  private async load(filePath: PathLike): Promise<void> {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')

    this._book = await createParser(String(filePath), {
      txtChapterRegexes: this.chapterRegexes()
    }).parse()
    this._book.setPosition(this.conf.get('position'))
  }

  private chapterRegexes(): RegExp[] {
    return compileRegexes(this.conf.get('txt')?.chapterRegex ?? [], (pattern) =>
      error(`无效的章节正则: ${pattern}`)
    )
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

  async currentLine(): Promise<number> {
    const book = await this.book()
    if (!book.currentLine) {
      error('仅文本文件支持行号')
      return 0
    }
    return book.currentLine()
  }

  async totalLine(): Promise<number> {
    const book = await this.book()
    if (!book.totalLine) {
      error('仅文本文件支持行号')
      return 0
    }
    return book.totalLine()
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
}
