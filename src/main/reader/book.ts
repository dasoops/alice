import EventEmitter from 'node:events'

export type BookType = 'txt' | 'epub'

// 跨格式统一阅读定位, 与 legado BookProgress(durChapterIndex/durChapterPos) 同构;
// 全局字符 index 等格式内部实现细节不进入共享抽象
export type Position = {
  chapterIndex: number
  chapterPos: number
}

// 行分页参数, txt 作用于全文, epub 作用于章内
export type PageOptions = {
  maxLine: number
  chunkSize: number
}

export type Chapter = {
  index: number
  title: string
  // legado 侧章节 index, 与 legado BookProgress.durChapterIndex 对齐
  // 当无匹配章节时为空
  legadoIndex?: number
}

// 阅读角标所需的进度: 本章页码从 1 开始, percent 为全书已读字符占比 [0, 1]
export type ReadingProgress = {
  chapterTitle: string
  page: number
  pageTotal: number
  percent: number
}

// 一次翻页的结果; end 为当前页末尾位置, txt 为全文字符偏移, epub 为章内偏移
export type PageRead = {
  content: string
  end: number
}

// 事件映射, 声明后 emit/on 参数受类型约束
export type BookEvents = {
  // 跨章时 emit 'chapter'(current, previous)
  chapter: [current: Chapter, previous: Chapter | undefined]
}

// 当前章节由 book 内部随定位维护
export interface Book extends EventEmitter<BookEvents> {
  readonly type: BookType
  readonly path: string
  readonly name: string
  readonly author: string
  readonly chapters: Chapter[]
  position(): Position
  setPosition(pos: Position, options?: PageOptions): void
  chapter(): Chapter
  // 相对当前定位返回一页文本并推进定位; offset 为 0 时读取当前页
  readPage(offset: number, options: PageOptions): PageRead
  // 按当前分页参数计算本章页码与全书字符进度; pageEnd 已由 readPage 算出时传入以复用
  readingProgress(options: PageOptions, pageEnd?: number): ReadingProgress
  // lines / jumpLine txt 独有, 显式可选
  lines?(): { current: number; total: number }
  // 返回新定位或 undefined(行不存在)
  jumpLine?(line: number): number | undefined
}
