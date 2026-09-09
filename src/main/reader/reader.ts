import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import { error } from '../util'
import { lineSeparator } from '../constants'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import { Chapter, findChapterAt } from './chapter'
import { compileChapterRegexes } from './txt/toc'
import type { Book } from './parser'
import { createParser } from './parser'
import { WebDavClient } from '../webdav'
import { ProgressSync } from './sync'
import EventEmitter from 'node:events'
import type { Config } from './config'

export class Reader extends EventEmitter {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly webdav: WebDavClient
  public readonly progressSync: ProgressSync
  public initlization: Promise<void>
  // load 完成前为空壳, 外部访问须先 await initlization
  public book: Book = { type: 'txt', path: '', name: '', author: '', content: '', chapters: [] }
  // 最近包含当前 index 的章节; index 在首章前或 toc 为空时为 undefined
  public chapter?: Chapter
  public get index(): number {
    return this.conf.get('index')
  }

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
      conf: conf,
      reader: this,
      webdav: this.webdav,
      mainWindow: mainWindow
    })

    this.initlization = this.init()
  }

  private async init(): Promise<void> {
    log.info(`Reader ==> init, conf: ${JSON.stringify(this.conf.store)}`)

    await this.load(this.conf.get('file'))
    this.refreshChapter(this.index)
    this.conf.onDidChange('index', (newValue) => {
      if (typeof newValue !== 'number') throw Error('unexpected')
      this.refreshChapter(newValue)
    })
    this.conf.onDidChange('file', async (newValue) => {
      if (!newValue) throw Error('unexpected')
      // clear
      this.conf.reset('index')
      await this.load(newValue as string)
      // load 重建了 toc, 以新 toc 重算当前章节, 避免残留旧书的章节
      this.refreshChapter(this.index)
      this.mainWindow.webContents.send('refresh-content')
    })
    ipcMain.handle('reader:read', async (_, offset: number): Promise<string> => {
      log.debug('on reader:read')
      return await this.read(offset)
    })
    log.info(`Reader <== init ok.`)
  }

  // 重算当前章节, 跨章时 emit 'chapter'; index 在首章前或 toc 为空时 chapter 为 undefined
  private refreshChapter(index: number): void {
    const previous = this.chapter
    const current = findChapterAt(this.book.chapters, index, this.chapter)
    if (current === previous) return
    this.chapter = current
    this.emit('chapter', current, previous)
  }

  private async load(filePath: PathLike): Promise<void> {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')

    this.book = await createParser(String(filePath), {
      txtChapterRegexes: this.chapterRegexes()
    }).parse()
  }

  private chapterRegexes(): RegExp[] {
    // 旧配置文件残留的顶层 txtChapterRegex 已废弃, 缺失时回退默认值
    return compileChapterRegexes(this.conf.get('txt')?.chapterRegex ?? [], (pattern) =>
      error(`无效的章节正则: ${pattern}`)
    )
  }

  async read(offset: number): Promise<string> {
    await this.initlization
    const { chunkSize, index, maxLine } = this.conf.store
    const content = this.book.content
    const contentLength = content.length
    log.debug(`Reader ==> index: ${index}`)

    const nextPage = (
      index: number,
      option?: { offset?: number; maxLine?: number; chunkSize?: number }
    ): number => {
      const offset0 = option?.offset ?? offset
      const maxLine0 = option?.maxLine ?? maxLine
      const chunkSize0 = option?.chunkSize ?? chunkSize

      const sign = offset0 === 0 ? 1 : Math.sign(offset0)
      let pageIndex = index
      let line = 0
      while (true) {
        if (line >= maxLine0) break
        if (Math.abs(pageIndex - index) >= chunkSize0) break
        const target = pageIndex + sign
        if (target < 0 || target > contentLength) break
        pageIndex = target

        const char = content[pageIndex]
        if (char === lineSeparator) line++
      }
      return pageIndex
    }

    // 指针为当前页文本头部, 初始化当前页 起始/结束索引
    let begin: number, end: number
    // 下一页 当前页结束 后翻一页
    if (offset > 0) {
      begin = nextPage(index)
      end = nextPage(begin)
      // 已达尾页
      if (begin === contentLength && end === contentLength) {
        // 从尾开始读一页
        begin = nextPage(contentLength, { offset: -1 })
      }
    }
    // 上一页 当前页起始 前翻一页
    else if (offset < 0) {
      begin = nextPage(index)
      end = index
      // 已达首页
      if (begin === 0 && end === 0) {
        // 从头开始读一页
        end = nextPage(0, { offset: 1 })
      }
    }
    // offset = 0
    else {
      begin = index
      end = nextPage(index)
    }
    const string = content.substring(begin, end)
    log.debug(`Reader ==> ${begin}..${end} = ${string}`)
    this.conf.set('index', begin)

    return string
  }

  async currentLine(): Promise<number> {
    await this.initlization
    return this.book.content.substring(0, this.index + 1).split(lineSeparator).length
  }

  async totalLine(): Promise<number> {
    await this.initlization
    return this.book.content.split(lineSeparator).length
  }

  async jumpLine(value: number): Promise<void> {
    await this.initlization
    let index = 0
    if (value > 1) {
      // 第4行: 跳过前2个分隔符, 找到第3行末尾分隔符, +1即为第4行起始点
      index = -1
      for (let n = 0; n < value - 1; n++) {
        index = this.book.content.indexOf(lineSeparator, index + 1)
        if (index === -1) break
      }
      if (index === -1) {
        error('指定行数不存在')
        return
      }
      index++
    }

    this.conf.set('index', index)

    this.mainWindow.webContents.send('refresh-content')
  }

  async jumpChapter(index: number, position: number = 0): Promise<void> {
    await this.initlization
    if (this.book.chapters.length === 0) {
      error('未识别到章节')
      return
    }
    let chapter: Chapter
    if (index < 0) {
      chapter = this.book.chapters[0]
    } else if (index > this.book.chapters.length - 1) {
      // 越界时跳转到最后一章
      chapter = this.book.chapters.at(-1)!
    } else {
      chapter = this.book.chapters.find((it) => it.index === index) ?? this.book.chapters[0]
    }

    // 超过本章, 跳转到下章开头; 无下章(末章)时跳到章节末尾
    if (chapter.beginChar + position > chapter.endChar) {
      chapter = this.book.chapters.find((it) => it.index === chapter.index + 1) ?? chapter
    }
    const target = Math.min(chapter.beginChar + position, chapter.endChar)
    this.conf.set('index', Math.max(target, chapter.beginChar))
    this.mainWindow.webContents.send('refresh-content')
  }
}
