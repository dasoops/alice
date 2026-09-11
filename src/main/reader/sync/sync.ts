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
  // 串行化队列尾: 上一次任务完成后才执行本次, 避免并发读写互相覆盖远端
  private pending?: Promise<void>

  constructor({ mode, webdav }: { mode: SyncMode; webdav: WebDavClient }) {
    this.mode = mode
    this.webdav = webdav
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

    // 远端领先: 交由调用方决定是否恢复; pull 关闭时静默跳过
    if (remote && compareProgress(this.mode, remote, current) > 0) {
      log.info('WebDavSync ==> 远端阅读进度领先')
      log.debug('WebDavSync ==> 远端: ' + JSON.stringify(remote, null, 2))
      log.debug('WebDavSync ==> 本地: ' + JSON.stringify(current, null, 2))
      return trigger.pull ? remote : undefined
    }
    // 本地领先: 上传; 远端不存在时视为本地领先
    if (!remote || compareProgress(this.mode, current, remote) > 0) {
      if (!trigger.push) return undefined
      await this.webdav.put(this.progressPath(book), JSON.stringify(current))
    }
    return undefined
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
