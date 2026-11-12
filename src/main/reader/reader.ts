import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import path from 'node:path'
import { error } from '../util'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'
import type { Book, BookEvents, Chapter, PageOptions, ReadingProgress } from './book'
import { createParser } from './parser'
import { WebDavClient } from '../webdav'
import { ProgressSync, type SyncTrigger } from './sync/sync'
import { compareProgress, type BookProgress, type SyncMode } from './sync/progress'
import EventEmitter from 'node:events'
import { Config, type StatusConfig } from './config'
import type { PopupManager } from '../popup'

// 最近阅读保留的最大条数
const maxRecent = 10

// ReaderEvents = 书籍事件 + 阅读器自身事件
export type ReaderEvents = BookEvents & {
  // 书籍切换成功, 供托盘重建最近阅读菜单
  book: []
}

// 阅读角标数据; 开关关闭时不计算进度, 仅回传配置
export type ReaderStatus = {
  config: StatusConfig
  progress?: ReadingProgress
}

// 翻页结果携带同一页算出的进度, 避免渲染层再请求一次 reader:status
export type ReadResult = {
  content: string
  status: ReaderStatus
}

export class Reader extends EventEmitter<ReaderEvents> {
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
    let loaded: string
    try {
      loaded = await this.load(path)
    } catch (err) {
      // 解析失败(如 epub 无正文章节)回滚文件配置, 保持旧书, 阻止切换
      this.conf.set('file', previous)
      this.mainWindow.webContents.send('loading-hide')
      error(`无法打开书籍: ${path}`)
      log.warn(`Reader ==> 打开书籍失败: ${err}`)
      return
    }
    this.recordRecent(loaded)
    this.emit('book')
    this.mainWindow.webContents.send('refresh-content')
    // 切换书籍后立即拉取远端进度, 窗口可见时允许弹恢复确认
    this.fireSync({ pull: true, push: true })
  }

  // 最近阅读列表, 按时间倒序, 过滤已删除文件
  public recentFiles(): string[] {
    return this.conf.get('recent').filter((file) => fs.existsSync(file))
  }

  private recordRecent(filePath: string): void {
    // 默认占位文本不进入最近阅读; 重复打开只刷新到最前
    if (filePath === Config.Default.file) return
    const recent = this.conf.get('recent').filter((it) => it !== filePath)
    recent.unshift(filePath)
    this.conf.set('recent', recent.slice(0, maxRecent))
  }

  private async init(): Promise<void> {
    log.info(`Reader ==> init, conf: ${JSON.stringify(this.conf.store)}`)

    // 先注册 handler, 避免书籍解析(大 epub 可能较慢)期间渲染进程调用 read 报未注册
    ipcMain.handle('reader:read', (_, offset: number): Promise<ReadResult> => {
      log.debug('on reader:read')
      return this.read(offset)
    })
    ipcMain.handle('reader:fileName', (): string => path.basename(this.conf.get('file')))
    ipcMain.handle('reader:status', (): Promise<ReaderStatus> => this.status())
    // 设置面板修改角标配置后, 推送主窗口即时更新位置/显隐
    this.conf.onDidChange('status', (status) => {
      this.mainWindow.webContents.send('status-config', status)
    })
    // 分页参数变化后让主窗口重读当前页; read 会同时返回新分页下的进度
    this.conf.onDidAnyChange((next, previous) => {
      if (!next || !previous) return
      if (next.maxLine === previous.maxLine && next.chunkSize === previous.chunkSize) return
      this.mainWindow.webContents.send('paging-config')
    })

    try {
      this.recordRecent(await this.load(this.conf.get('file')))
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

  // 返回实际加载的文件路径(文件不存在时会回退默认文本)
  private async load(filePath: PathLike): Promise<string> {
    if (!fs.existsSync(filePath)) {
      filePath = Config.Default.file
      fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')
    }

    this._book = await createParser(String(filePath), this.conf).parse()
    // 转发 book 章节事件, 供 tray 重建菜单与进度同步使用
    this._book.on('chapter', (chapter: Chapter, previous: Chapter | undefined) => {
      this.emit('chapter', chapter, previous)
    })
    const { maxLine, chunkSize } = this.conf.store
    this._book.setPosition(this.conf.get('position'), { maxLine, chunkSize })
    return String(filePath)
  }

  async read(offset: number): Promise<ReadResult> {
    const book = await this.book()
    const { maxLine, chunkSize } = this.conf.store
    const options = { maxLine, chunkSize }
    log.debug(`Reader ==> position: ${JSON.stringify(book.position())}`)

    const page = book.readPage(offset, options)
    log.debug(`Reader ==> ${page.content}`)
    this.conf.set('position', book.position())

    return { content: page.content, status: this.statusOf(book, options, page.end) }
  }

  // 阅读角标数据; 关闭时不计算分页, 避免大文件首次展示时的全章扫描
  async status(): Promise<ReaderStatus> {
    const config = this.conf.get('status')
    if (!config.enabled) return { config }

    const book = await this.book()
    const { maxLine, chunkSize } = this.conf.store
    return this.statusOf(book, { maxLine, chunkSize })
  }

  // pageEnd 由 readPage 算出时传入, 复用同一次分页结果计算百分比;
  // 进度计算失败不应阻断正文翻页, 因此在此隔离异常
  private statusOf(book: Book, options: PageOptions, pageEnd?: number): ReaderStatus {
    const config = this.conf.get('status')
    if (!config.enabled) return { config }
    // 当前格式不使用页码时跳过整章分页, 避免大文本无谓扫描
    const active = config.formats.find((item) => item.enabled)
    const withPageInfo = active ? /\{(?:page|total)\}/.test(active.template) : false
    try {
      return { config, progress: book.readingProgress(options, pageEnd, withPageInfo) }
    } catch (err) {
      log.warn(`Reader ==> 计算阅读进度失败: ${err}`)
      return { config }
    }
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
    const { maxLine, chunkSize } = this.conf.store
    book.setPosition({ chapterIndex: index, chapterPos: position }, { maxLine, chunkSize })
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

  // 托盘菜单手动拉取: 复用同步流程, 远端领先时由 sync 弹恢复确认
  public async pullProgress(): Promise<void> {
    await this.initlization
    if (!this.webdav.enabled()) {
      error('请先启用 WebDav 同步')
      return
    }
    try {
      // 手动拉取是明确意图, 清掉忽略快照, 保证远端领先时仍会弹恢复确认
      this.promptedRemote = undefined
      log.info('WebDavSync ==> 手动拉取云端进度')
      await this.sync({ pull: true, push: false })
    } catch (err) {
      error('拉取云端进度失败')
      log.warn(`WebDavSync ==> 拉取云端进度失败: ${err}`)
    }
  }

  // 托盘菜单手动覆盖: 展示云端/本地进度后二次确认, 确认后静默上传
  public async overwriteProgress(): Promise<void> {
    await this.initlization
    if (!this.webdav.enabled()) {
      error('请先启用 WebDav 同步')
      return
    }
    try {
      const book = await this.book()
      const local = this.localProgress(book)
      const remote = await this.progressSync.fetch(book)
      const response = await this.popup.message({
        type: 'warning',
        title: 'WebDav 同步',
        message: '以本地进度覆盖云端进度?',
        detail: `云端进度: ${remote ? remote.durChapterTitle : '无'}\n本地进度: ${local.durChapterTitle}`,
        buttons: ['覆盖', '取消'],
        // 覆盖不可撤销, 默认按钮与 Esc 均回到取消
        defaultId: 1,
        cancelId: 1
      })
      if (response !== 0) return
      await this.progressSync.push(book, local)
      // 云端已被本地覆盖, 避免随后自动同步就同一进度重复提示
      this.promptedRemote = local
      log.info('WebDavSync ==> 手动覆盖云端进度')
    } catch (err) {
      error('覆盖云端进度失败')
      log.warn(`WebDavSync ==> 覆盖云端进度失败: ${err}`)
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
