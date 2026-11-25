import log from 'electron-log/renderer'
import type { ChapterView, ReaderStatus, StatusConfig } from '../../../shared/reader'
import type { ReaderStyle } from '../../../shared/readerStyle'
import { paginate, paginateAround, textToHtml } from '../lib/paginator'
import {
  applyReaderStyle,
  clearLoading,
  renderContent,
  renderLoading,
  renderStatus,
  toggleReaderLock,
  type ReaderElements
} from './dom'

type ReaderApi = Window['api']['reader']

// 缓存整章页网格的章节数, 避免长期阅读时累积大量章节文本
const maxCachedChapters = 4

export type ReaderSessionOptions = {
  elements: ReaderElements
  api: ReaderApi
}

// 阅读窗口的分页状态机: 持有章节/页边界/阅读锚点, 并把重排与进度提交串行化
export class ReaderSession {
  private readonly elements: ReaderElements
  private readonly api: ReaderApi

  private statusConfig: StatusConfig | undefined
  private statusProgress: ReaderStatus['progress']
  private view: ChapterView | undefined
  private pages: number[] = []
  private pageIndex = 0
  // 跨排版的阅读锚点: 始终作为当前页首字符; 翻页/加载章节时更新, 重排不改变
  private anchorPos = 0
  // 进入上一章时锚点指向章尾字符, 需要走整章分页并落到最后一页
  private preferLastPage = false
  // 内容区不可见(窗口尚未显示)时高度为 0, 此时不写入分页结果, 保留原阅读位置
  private measured = false
  // 最近一次分页对应的内容区尺寸; 尺寸未变时忽略 ResizeObserver 的重复通知
  private layoutKey = ''
  private forceReflow = false
  // 从章首开始的整章页网格; 回翻到同一章时直接复用, 跳过重复整章测量
  private readonly pageCache = new Map<number, { key: string; text: string; starts: number[] }>()

  // commitPosition 会推进主进程侧阅读位置, 并发调用会让位置与显示错乱, 故串行化
  private queue: Promise<void> = Promise.resolve()
  private reflowTimer: number | undefined
  // showLoading 需要异步取文件名, 用 token 避免 hide 之后迟到的 show 把内容再次隐藏
  private loadingToken = 0

  constructor(options: ReaderSessionOptions) {
    this.elements = options.elements
    this.api = options.api
  }

  applyStyle(style: ReaderStyle): void {
    applyReaderStyle(style)
    this.scheduleReflow(true)
  }

  applyStatusConfig(config: StatusConfig): void {
    this.statusConfig = config
    if (!config.enabled) {
      this.statusProgress = undefined
    } else if (!this.statusProgress && this.view) {
      // 从关闭切到启用时先用占位进度, 保证重排前已预留角标间距
      this.statusProgress = {
        chapterTitle: this.view.chapterTitle,
        percent: 0,
        page: 1,
        pageTotal: 1
      }
    }
    this.renderStatus()
    this.scheduleReflow(true)
  }

  toggleLock(): void {
    toggleReaderLock(this.elements)
  }

  refresh(): Promise<void> {
    // 章节位置将由主进程重新给出, 丢弃尚未执行的整章重排
    this.cancelReflow()
    return this.enqueue(() => this.loadChapter())
  }

  changePage(offset: number): Promise<void> {
    return this.enqueue(() => this.turnPage(offset))
  }

  async showLoading(): Promise<void> {
    const token = ++this.loadingToken
    const name = await this.api.fileName()
    if (token !== this.loadingToken) return
    renderLoading(this.elements, name)
  }

  hideLoading(): void {
    this.loadingToken++
    clearLoading(this.elements)
    // 加载失败时会保留旧书, 用缓存进度恢复角标
    this.renderStatus()
  }

  // 尺寸/样式/角标变化后按阅读锚点重新分页, 保留读者看到的文字位置
  scheduleReflow(force = false): void {
    if (force) {
      this.forceReflow = true
      // 强制重排意味着样式/字体/角标布局已变, 缓存页网格不可再复用
      this.pageCache.clear()
    }
    if (this.reflowTimer !== undefined) window.clearTimeout(this.reflowTimer)
    this.reflowTimer = window.setTimeout(() => {
      this.reflowTimer = undefined
      this.enqueue(() => this.reflow()).catch((err) => {
        log.warn('重新分页失败', err)
      })
    }, 80)
  }

  private cancelReflow(): void {
    if (this.reflowTimer === undefined) return
    window.clearTimeout(this.reflowTimer)
    this.reflowTimer = undefined
    this.forceReflow = false
  }

  private withPageInfo(progress: ReaderStatus['progress']): ReaderStatus['progress'] {
    if (!progress) return progress
    return {
      ...progress,
      page: this.pages.length > 0 ? this.pageIndex + 1 : undefined,
      pageTotal: this.pages.length > 0 ? this.pages.length : undefined
    }
  }

  private renderStatus(): void {
    renderStatus(this.elements, this.statusConfig, this.statusProgress)
  }

  // 主进程只返回章节与百分比, 页码由渲染层按当前分页结果补齐
  private applyStatus(status: ReaderStatus): void {
    this.statusConfig = status.config
    this.statusProgress = this.withPageInfo(status.progress)
    this.renderStatus()
  }

  // 分页前先按角标配置预留间距; 页码用占位值, 避免 {page} 类格式因空值被误判为不显示
  private applyStatusForLayout(status: ReaderStatus): void {
    this.statusConfig = status.config
    this.statusProgress = status.progress
      ? { ...status.progress, page: 1, pageTotal: 1 }
      : undefined
    this.renderStatus()
  }

  private applyPageInfo(): void {
    if (!this.statusProgress) return
    this.statusProgress = this.withPageInfo(this.statusProgress)
    this.renderStatus()
  }

  private layoutSignature(): string {
    const el = this.elements.content
    return `${el.clientWidth}x${el.clientHeight}`
  }

  private currentPageStart(): number {
    return this.pages[this.pageIndex] ?? 0
  }

  private currentPageEnd(): number {
    return this.pages[this.pageIndex + 1] ?? this.view?.text.length ?? 0
  }

  // 用真实内容节点测量分页; 测量期间隐藏绘制, 避免中间态闪现
  private paginateChapter(): void {
    if (!this.view) return
    const el = this.elements.content
    const key = this.layoutSignature()
    this.measured = el.clientHeight > 0
    const previousVisibility = el.style.visibility
    el.style.visibility = 'hidden'
    try {
      if (!this.measured) {
        // 尺寸未知时保留整章单页占位, 等 ResizeObserver 触发后再排
        this.pages = [0]
        this.pageIndex = 0
      } else if (this.preferLastPage || this.anchorPos <= 0) {
        this.pages = this.fullPages(key)
        this.pageIndex = this.preferLastPage ? this.pages.length - 1 : 0
      } else {
        // 以 anchor 作为当前页首, 前后分别补齐页边界, 保证首字不随排版变化
        const slice = paginateAround(el, this.view.text, this.anchorPos, { restore: false })
        this.pages = slice.starts
        this.pageIndex = slice.currentIndex
      }
    } finally {
      el.style.visibility = previousVisibility
    }
    if (this.measured) {
      this.layoutKey = key
      this.anchorPos = this.currentPageStart()
      this.preferLastPage = false
    }
  }

  // 从章首开始的整章页网格, 命中缓存时跳过整章测量
  private fullPages(key: string): number[] {
    const view = this.view
    if (!view) return [0]
    const cached = this.pageCache.get(view.chapterIndex)
    if (cached && cached.key === key && cached.text === view.text) {
      this.touchCache(view.chapterIndex, cached)
      return cached.starts
    }
    const starts = paginate(this.elements.content, view.text, { restore: false })
    this.touchCache(view.chapterIndex, { key, text: view.text, starts })
    return starts
  }

  private touchCache(index: number, entry: { key: string; text: string; starts: number[] }): void {
    // 重新插入使 Map 保持按最近使用排序, 超限时淘汰最旧章节
    this.pageCache.delete(index)
    this.pageCache.set(index, entry)
    while (this.pageCache.size > maxCachedChapters) {
      const oldest = this.pageCache.keys().next().value
      if (oldest === undefined) break
      this.pageCache.delete(oldest)
    }
  }

  private renderPage(): void {
    if (!this.view) return
    const start = this.currentPageStart()
    const end = this.currentPageEnd()
    renderContent(this.elements, textToHtml(this.view.text.substring(start, end)))
    this.applyPageInfo()
  }

  private async commitPosition(chapterPos: number): Promise<void> {
    // 未测量成功时 pages 是占位单页, 写入会覆盖真实阅读位置
    if (!this.view || !this.measured) return
    const chapterIndex = this.view.chapterIndex
    const status = await this.api.commitPosition(chapterIndex, chapterPos, this.currentPageEnd())
    // 提交期间章节被外部跳转(托盘/同步)时结果已过期, 交给 refresh 重载
    if (this.view?.chapterIndex !== chapterIndex) return
    this.applyStatus(status)
  }

  private async loadChapter(delta?: -1 | 1): Promise<void> {
    if (!this.view) await this.showLoading()
    let next: ChapterView | undefined
    try {
      next = delta ? await this.api.moveChapter(delta) : await this.api.chapter()
    } finally {
      this.hideLoading()
    }
    if (!next) return
    // 已到首/末章时主进程位置不变, 无需重排
    if (delta && this.view && next.chapterIndex === this.view.chapterIndex) return

    this.view = next
    this.anchorPos = this.view.chapterPos
    // 上一章末页、或保存位置就在章尾时, 按整章分页后落到最后一页
    this.preferLastPage =
      delta === -1 ||
      (this.view.text.length > 0 && this.view.chapterPos >= this.view.text.length - 1)
    // 先按角标配置预留上下间距, 再按真实可用高度分页
    this.applyStatusForLayout(this.view.status)
    this.paginateChapter()
    this.renderPage()
    if (this.measured) await this.commitPosition(this.anchorPos)
  }

  private async turnPage(offset: number): Promise<void> {
    if (!this.view) {
      await this.loadChapter()
      return
    }
    // 窗口未显示或正在加载时无法分页, 先等尺寸就绪
    if (!this.measured || this.elements.content.classList.contains('hidden')) {
      this.scheduleReflow(true)
      return
    }
    if (offset > 0) {
      if (this.pageIndex < this.pages.length - 1) {
        this.pageIndex++
        this.anchorPos = this.currentPageStart()
        this.renderPage()
        await this.commitPosition(this.anchorPos)
        return
      }
      if (this.view.chapterIndex < this.view.chapterCount - 1) await this.loadChapter(1)
      return
    }
    if (offset < 0) {
      if (this.pageIndex > 0) {
        this.pageIndex--
        this.anchorPos = this.currentPageStart()
        this.renderPage()
        await this.commitPosition(this.anchorPos)
        return
      }
      if (this.view.chapterIndex > 0) await this.loadChapter(-1)
    }
  }

  private async reflow(): Promise<void> {
    if (!this.view) return
    // loading 期间内容不可测量, 等 refresh-content 重新加载后再排
    if (
      this.elements.content.classList.contains('hidden') ||
      this.elements.content.clientHeight <= 0
    )
      return
    const key = this.layoutSignature()
    if (!this.forceReflow && key === this.layoutKey) return
    this.forceReflow = false
    this.renderStatus()

    // 以 anchor 为页首重新分页, 首字保持不变; 页尾只用于计算角标百分比
    this.paginateChapter()
    if (!this.measured) return
    this.renderPage()
    await this.commitPosition(this.anchorPos)
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.catch(() => undefined).then(task)
    this.queue = next
    return next
  }
}
