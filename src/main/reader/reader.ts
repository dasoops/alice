import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import { dataDir, error, md5 } from '../util'
import { lineSeparator } from '../constants'
import path from 'path'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import { buildToc, Chapter, compileChapterRegexes, findChapterAt } from './toc'
import type { BookMeta } from './progress'
import { WebDavClient } from '../webdav'
import { ProgressSync } from './sync'
import EventEmitter from 'node:events'
import type { Config } from './config'

function findNthIndex(str: string, char: string, skip: number): number {
  let count = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      if (count === skip) return i
      count++
    }
  }
  return -1
}

export class Reader extends EventEmitter {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly webdav: WebDavClient
  public readonly progressSync: ProgressSync

  private readonly cacheDir = path.join(dataDir, 'cache')
  public filePath?: PathLike
  public cachePath?: string
  public initlization: Promise<void>

  private content?: string
  public chapters: Chapter[] = []
  // 最近包含当前 index 的章节; index 在首章前或 toc 为空时为 undefined
  public chapter?: Chapter

  public get metadata(): BookMeta {
    const file = String(this.filePath ?? '')
    return { name: path.basename(file, path.extname(file)), author: '' }
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
    log.info(
      `Reader ==> init, conf: ${JSON.stringify(this.conf.store)}, cacheDir: ${this.cacheDir}`
    )

    // ensure dir
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }

    this.content = await this.init0(this.conf.get('file'))
    this.refreshChapter(this.conf.get('index'))
    this.conf.onDidChange('index', (newValue) => {
      if (typeof newValue !== 'number') throw Error('unexpected')
      this.refreshChapter(newValue)
    })
    this.conf.onDidChange('file', async (newValue) => {
      if (!newValue) throw Error('unexpected')
      // clear
      this.conf.reset('index')
      this.content = await this.init0(newValue as string)
      // init0 重建了 toc, 以新 toc 重算当前章节, 避免残留旧书的章节
      this.refreshChapter(this.conf.get('index'))
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
    const current = findChapterAt(this.chapters, index)
    if (current === previous) return
    this.chapter = current
    this.emit('chapter', current, previous)
  }

  private async init0(filePath: PathLike): Promise<string> {
    this.filePath = filePath
    // create hash
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')
    const fileMd5 = await md5(filePath)

    // 快速连续切换文件时可能并发 init0, 闭包绑定本次调用的路径, 避免读到下一次调用的 cache
    const cachePath = path.resolve(this.cacheDir, `${fileMd5}.cache`)
    const tocPath = path.resolve(this.cacheDir, `${fileMd5}.toc`)

    this.cachePath = cachePath
    const result = (): string => {
      log.info(`Reader ==> open ${cachePath}`)
      return fs.readFileSync(cachePath, 'utf-8')
    }

    const hashPath = path.resolve(this.cacheDir, `${fileMd5}.hash`)
    if (fs.existsSync(hashPath) && fileMd5 === fs.readFileSync(hashPath, 'utf-8')) {
      if (fs.existsSync(tocPath)) {
        this.chapters = JSON.parse(fs.readFileSync(tocPath, 'utf-8')) as Chapter[]
        return result()
      }
      const content = result()
      this.chapters = this.buildToc(content)
      fs.writeFileSync(tocPath, JSON.stringify(this.chapters), 'utf-8')
      return content
    }

    // create hash file
    fs.writeFileSync(hashPath, fileMd5, { encoding: 'utf-8' })

    // clear config
    this.conf.reset('index')

    // create cache file
    const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' })
    const writeStream = fs.createWriteStream(cachePath)
    let currentLine = ''
    readStream.on('data', (chunk0: Buffer | string) => {
      const chunk = typeof chunk0 === 'string' ? chunk0 : chunk0.toString('utf-8')
      for (let i = 0; i < chunk.length; i++) {
        const it = chunk.charAt(i)

        if (it === '\r' || it === '\n') {
          if (currentLine.length > 0) {
            writeStream.write(currentLine + lineSeparator)
            currentLine = ''
            continue
          }
          continue
        }

        currentLine += it
      }
    })
    readStream.on('end', () => {
      if (currentLine.length !== 0) {
        writeStream.write(currentLine)
      }
      writeStream.end()
    })
    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(undefined))
      writeStream.on('error', reject)
      readStream.on('error', reject)
    })

    // create toc file
    const content = result()
    this.chapters = this.buildToc(content)
    fs.writeFileSync(tocPath, JSON.stringify(this.chapters), 'utf-8')

    return content
  }

  private chapterRegexes(): RegExp[] {
    return compileChapterRegexes(this.conf.get('txtChapterRegex'), (pattern) =>
      error(`无效的章节正则: ${pattern}`)
    )
  }

  private buildToc(content: string): Chapter[] {
    return buildToc(this.chapterRegexes(), content)
  }

  async read(offset: number): Promise<string> {
    await this.initlization
    const { chunkSize, index, maxLine } = this.conf.store
    const contentLength = this.content!.length
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

        const char = this.content![pageIndex]
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
    const string = this.content!.substring(begin, end)
    log.debug(`Reader ==> ${begin}..${end} = ${string}`)
    this.conf.set('index', begin)

    return string
  }

  async currentLine(): Promise<number> {
    await this.initlization
    const index = this.conf.get('index')
    return this.content!.substring(0, index + 1).split(lineSeparator).length
  }

  async totalLine(): Promise<number> {
    await this.initlization
    return this.content!.split(lineSeparator).length
  }

  async jumpLine(value: number): Promise<void> {
    await this.initlization
    let index: number
    if (value === 1) {
      index = 0
    } else {
      // 第4行: 跳过前2个分隔符, 找到第3行末尾分隔符, +1即为第4行起始点
      index = findNthIndex(this.content!, lineSeparator, value - 2) + 1
    }
    if (index === -1) {
      error('指定行数不存在')
      return
    }

    this.conf.set('index', index)

    this.mainWindow.webContents.send('refresh-content')
  }

  async jumpChapter(index: number, position: number = 0): Promise<void> {
    await this.initlization
    if (this.chapters.length === 0) {
      error('未识别到章节')
      return
    }
    let chapter: Chapter
    if (index < 0) {
      chapter = this.chapters[0]
    } else if (index > this.chapters.length - 1) {
      // 越界时跳转到最后一章
      chapter = this.chapters.at(-1)!
    } else {
      chapter = this.chapters.find((it) => it.index === index) ?? this.chapters[0]
    }

    // 超过本章, 跳转到下章开头; 无下章(末章)时跳到章节末尾
    if (chapter.beginChar + position > chapter.endChar) {
      chapter = this.chapters.find((it) => it.index === chapter.index + 1) ?? chapter
    }
    const target = Math.min(chapter.beginChar + position, chapter.endChar)
    this.conf.set('index', Math.max(target, chapter.beginChar))
    this.mainWindow.webContents.send('refresh-content')
  }

  // 全文字符偏移 → 章内进度, durChapterPos = index - beginChar
  async indexToChapter(
    index: number
  ): Promise<{ chapterIndex: number; position: number; title: string }> {
    await this.initlization
    const chapter = findChapterAt(this.chapters, index)
    if (!chapter) return { chapterIndex: 0, position: 0, title: '' }
    return {
      chapterIndex: chapter.index,
      position: index - chapter.beginChar,
      title: chapter.title
    }
  }
}
