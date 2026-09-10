import { BrowserWindow, dialog } from 'electron'
import {
  bookProgressFileName,
  compareProgress,
  type BookMeta,
  type BookProgress,
  type SyncMode
} from './progress'
import { WebDavClient } from '../../webdav'
import log from 'electron-log/main'

// legado 使用的进度目录
const legadoDir = 'bookProgress'

export type SyncTrigger = {
  pull: boolean
  push: boolean
}

export class ProgressSync {
  private readonly mode: SyncMode
  private readonly webdav: WebDavClient
  private readonly mainWindow: BrowserWindow
  // 串行化队列尾: 上一次任务完成后才执行本次, 避免并发读写互相覆盖远端
  private pending?: Promise<void>
  // 已弹窗确认过的远端进度快照; 用户忽略后, 队列中相同远端的重复同步不再重复弹窗
  private promptedRemote?: BookProgress

  constructor({
    mode,
    webdav,
    mainWindow
  }: {
    mode: SyncMode
    webdav: WebDavClient
    mainWindow: BrowserWindow
  }) {
    this.mode = mode
    this.webdav = webdav
    this.mainWindow = mainWindow
  }

  // 返回远端进度表示应恢复, undefined 表示已上传/跳过/未启用;
  public sync(
    book: BookMeta,
    local: () => BookProgress,
    trigger: SyncTrigger = { pull: true, push: true }
  ): Promise<BookProgress | undefined> {
    const run = (this.pending ?? Promise.resolve()).then(() => this.sync0(book, local, trigger))
    // 队列尾吞掉错误, 保证本次失败不阻塞后续任务
    this.pending = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async sync0(
    book: BookMeta,
    local: () => BookProgress,
    trigger: SyncTrigger
  ): Promise<BookProgress | undefined> {
    if (!this.webdav.enabled()) return undefined

    await this.webdav.ensureDirs(legadoDir)
    const remote = await this.fetch(book)
    // 执行时取最新本地进度, 避免旧值误导性提示
    const current = local()

    // 远端领先
    if (remote && compareProgress(this.mode, remote, current) > 0) {
      if (!trigger.pull) return undefined
      // 已就同一远端进度弹过窗(用户忽略), 不重复打扰; 远端变化时重新弹窗
      if (this.promptedRemote && compareProgress(this.mode, remote, this.promptedRemote) === 0) {
        return undefined
      }
      this.promptedRemote = remote
      log.info('WebDavSync ==> 远端阅读进度领先')
      log.info('WebDavSync ==> 远端' + JSON.stringify(remote, null, 2))
      log.info('WebDavSync ==> 本地' + JSON.stringify(current, null, 2))
      const { response } = await dialog.showMessageBox(this.mainWindow, {
        type: 'question',
        title: 'WebDav 同步',
        message: '远端阅读进度领先, 是否恢复?',
        detail: `远端进度: ${remote.durChapterTitle}`,
        buttons: ['恢复远端进度', '忽略']
      })
      return response === 0 ? remote : undefined
    }
    // 本地领先
    if (!remote || compareProgress(this.mode, current, remote) > 0) {
      if (!trigger.push) return undefined
      await this.webdav.put(this.progressPath(book), JSON.stringify(current))
    }
    return undefined
  }

  public reset(): void {
    this.promptedRemote = undefined
  }

  private async fetch(book: BookMeta): Promise<BookProgress | undefined> {
    const { status, text } = await this.webdav.get(this.progressPath(book))
    // 404 视为无远端进度
    if (status === 404) return undefined
    if (status !== 200) throw Error(`get progress failed: ${status}`)
    return JSON.parse(text) as BookProgress
  }

  private progressPath(book: BookMeta): string {
    return `${legadoDir}/${bookProgressFileName(book.name, book.author)}`
  }
}
