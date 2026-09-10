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
}

// 事件映射, 声明后 emit/on 参数受类型约束
export type BookEvents = {
  // 跨章时 emit 'chapter'(current, previous)
  chapter: [current: Chapter | undefined, previous: Chapter | undefined]
}

// 当前章节由 book 内部随定位维护
export interface Book extends EventEmitter<BookEvents> {
  readonly type: BookType
  readonly path: string
  readonly name: string
  readonly author: string
  readonly chapters: Chapter[]
  position(): Position
  setPosition(pos: Position): void
  chapter(): Chapter | undefined
  // 相对当前定位返回一页文本并更新定位; offset 为 0 时读取当前页
  readPage(offset: number, options: PageOptions): string
  // lines / jumpLine txt 独有, 显式可选
  lines?(): { current: number; total: number }
  // 返回新定位或 undefined(行不存在)
  jumpLine?(line: number): number | undefined
}
