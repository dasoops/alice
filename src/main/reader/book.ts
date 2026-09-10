import type { PathLike } from 'node:fs'

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

export interface Book {
  readonly type: BookType
  readonly path: PathLike
  readonly name: string
  readonly author: string
  readonly chapters: Chapter[]
  position(): Position
  setPosition(pos: Position): void
  currentChapter(): Chapter | undefined
  // 相对当前定位返回一页文本并更新定位; offset 为 0 时读取当前页
  readPage(offset: number, options: PageOptions): string
  // 行号能力为 txt 独有, 显式可选; jumpLine 返回新定位或 undefined(行不存在)
  currentLine?(): number
  totalLine?(): number
  jumpLine?(line: number): number | undefined
}
