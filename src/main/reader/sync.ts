import { BrowserWindow, dialog } from 'electron'
import { Conf } from 'electron-conf'
import log from 'electron-log/main'
import type { Config as ReaderConfig } from './config'
import type { Reader } from './reader'
import { WebDavClient } from '../webdav'
import {
  bookProgressFileName,
  compareProgress,
  type BookMeta,
  type BookProgress,
  type SyncMode
} from './progress'
import { error } from '../util'

// interactive: 允许与用户交互(弹窗确认恢复远端进度); silent: 静默, 远端领先时直接跳过
type SyncTrigger = 'interactive' | 'silent'

export class ProgressSync {
  private readonly conf: Conf<ReaderConfig>
  private readonly reader: Reader
  private readonly webdav: WebDavClient
  private readonly mainWindow: BrowserWindow

  public initlization: Promise<void>

  private dirty = false
  private currentRun?: Promise<void>
  private warnedNoChapter = false
  // 合并期间的触发以此模式参与下一轮, 后触发覆盖先触发
  private pendingMode?: SyncTrigger

  constructor({
    conf,
    reader,
    webdav,
    mainWindow
  }: {
    conf: Conf<ReaderConfig>
    reader: Reader
    webdav: WebDavClient
    mainWindow: BrowserWindow
  }) {
    this.conf = conf
    this.reader = reader
    this.webdav = webdav
    this.mainWindow = mainWindow

    this.initlization = this.init()
  }

  private async init(): Promise<void> {
    await this.reader.initlization
    // hide 静默推送(远端不落后才上传), show 完整同步(窗口可见时可弹恢复确认)
    this.mainWindow.on('hide', () => this.schedule('silent'))
    this.mainWindow.on('show', () => this.schedule('interactive'))
    this.reader.on('chapter', () => this.schedule('interactive'))
    this.schedule('interactive')
  }

  // 进度文件路径, 相对 webdav 配置的 directory
  private progressPath(book: BookMeta): string {
    return `bookProgress/${bookProgressFileName(book.name, book.author)}`
  }

  // 同步进行中忽略新触发, 只置脏标记, 空闲后补一次
  private readonly schedule = (mode: SyncTrigger = 'silent'): void => {
    this.pendingMode = mode
    if (this.currentRun) {
      this.dirty = true
      return
    }
    this.currentRun = this.runLoop().finally(() => {
      this.currentRun = undefined
    })
  }

  private async runLoop(): Promise<void> {
    do {
      this.dirty = false
      const mode = this.pendingMode ?? 'silent'
      this.pendingMode = undefined
      try {
        await this.syncOnce(mode)
      } catch (err) {
        // 失败仅记日志, 不阻塞阅读
        log.warn(`WebDavSync ==> sync failed: ${err}`)
      }
    } while (this.dirty)
  }

  // before-quit 时调用, await 完成; silent 模式: 不弹恢复确认, 仅在本地领先时上传
  public async flush(): Promise<void> {
    if (this.currentRun) {
      await this.currentRun
      return
    }
    try {
      await this.syncOnce('silent')
    } catch (err) {
      log.warn(`WebDavSync ==> flush failed: ${err}`)
    }
  }

  // 弹窗交互的前提: 触发方声明 interactive 且此刻窗口可见(窗口隐藏时模态框不可见)
  private canPrompt(mode: SyncTrigger): boolean {
    return mode === 'interactive' && this.mainWindow.isVisible()
  }

  private async syncOnce(mode: SyncTrigger = 'silent'): Promise<void> {
    if (!this.webdav.enabled()) return

    // 前置约束: legado 未配置规则会自动选规则/拆分超长章节, 导致序号错位
    await this.reader.initlization
    const chapters = this.reader.chapters
    if (this.conf.get('txt')?.chapterRegex.length === 0 || chapters.length === 0) {
      if (!this.warnedNoChapter) {
        this.warnedNoChapter = true
        error('未配置章节规则或章节表为空, WebDav 同步已禁用')
      }
      return
    }

    // name 决定远端文件名, 为空会生成 "_.json" 污染远端目录
    const book = this.reader.metadata
    if (!book.name) {
      // name 决定远端文件名, 为空会生成 "_.json" 污染远端目录
      log.warn('WebDavSync ==> book name empty, sync skipped')
      return
    }

    await this.webdav.ensureDirs('bookProgress')

    const local = await this.localProgress(book)
    const remote = await this.fetchRemote(book)

    if (remote && compareProgress(this.syncMode(), remote, local) > 0) {
      if (!this.canPrompt(mode)) return
      await this.restoreRemote(remote)
      return
    }
    // 远端无进度或本地领先 → 上传; 相等 → 不动
    if (!remote || compareProgress(this.syncMode(), local, remote) > 0) {
      await this.webdav.put(this.progressPath(book), JSON.stringify(local))
    }
  }

  // 同步粒度: chapter 模式只同步章节信息, 上传位置恒为 0 且比较忽略章内位置
  private syncMode(): SyncMode {
    return this.conf.get('sync')?.mode ?? 'approximate'
  }

  private async localProgress(book: BookMeta): Promise<BookProgress> {
    await this.reader.initlization
    const { chapterIndex, position, title } = await this.reader.indexToChapter(
      this.conf.get('index')
    )
    return {
      name: book.name,
      author: book.author,
      durChapterIndex: chapterIndex,
      durChapterPos: this.syncMode() === 'chapter' ? 0 : position,
      durChapterTime: Date.now(),
      durChapterTitle: title
    }
  }

  private async fetchRemote(book: BookMeta): Promise<BookProgress | undefined> {
    const { status, text } = await this.webdav.get(this.progressPath(book))
    // 404 视为无远端进度
    if (status === 404) return undefined
    if (status !== 200) throw Error(`get progress failed: ${status}`)
    return JSON.parse(text) as BookProgress
  }

  private async restoreRemote(remote: BookProgress): Promise<void> {
    const { response } = await dialog.showMessageBox(this.mainWindow, {
      type: 'question',
      title: 'WebDav 同步',
      message: '远端阅读进度领先, 是否恢复?',
      detail: `远端进度: ${remote.durChapterTitle}`,
      buttons: ['恢复远端进度', '忽略']
    })
    if (response !== 0) return

    // chapter 模式仅恢复章节信息, 跳转到章节头
    const position = this.syncMode() === 'chapter' ? 0 : remote.durChapterPos
    await this.reader.jumpChapter(remote.durChapterIndex, position)
  }
}
