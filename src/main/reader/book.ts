import EventEmitter from 'node:events'
import type { Position } from '../../shared/reader'

export type { Position, ReadingProgress } from '../../shared/reader'

export type BookType = 'txt' | 'epub'

export type Chapter = {
  index: number
  title: string
  // legado 侧章节 index, 与 legado BookProgress.durChapterIndex 对齐
  // 当无匹配章节时为空
  legadoIndex?: number
}

// 卷是 chapters 的区间视图: 只存范围, 不复制章节数组;
// 恒满足区间首尾相接并覆盖 [0, chapters.length)
export type Volume = {
  // 缺省表示目录层级之前的前置组(前言/封面等)
  title?: string
  // 卷首章节 index(该章计入范围)
  head: number
  // 在 chapters 中的起始下标(含)
  start: number
  // 结束下标(不含)
  end: number
}

// 事件映射, 声明后 emit/on 参数受类型约束
export type BookEvents = {
  // 跨章时 emit 'chapter'(current, previous)
  chapter: [current: Chapter, previous: Chapter | undefined]
}

// 当前章节由 book 内部随定位维护; 分页由渲染层按实际排版完成,
// 主进程只负责章节文本、字符位置与全书进度
export interface Book extends EventEmitter<BookEvents> {
  readonly type: BookType
  readonly path: string
  readonly name: string
  readonly author: string
  readonly chapters: Chapter[]
  readonly volumes: Volume[]
  position(): Position
  setPosition(pos: Position): void
  chapter(): Chapter
  chapterText(): string
  // 章内位置对应的全书字符占比; 超出章范围时 clamp
  percentAt(chapterPos: number): number
  // 移动到相邻章节; 成功返回 true, 越界返回 false
  moveChapter(delta: -1 | 1): boolean
  // lines / jumpLine txt 独有, 显式可选
  lines?(): { current: number; total: number }
  // 返回新定位或 undefined(行不存在)
  jumpLine?(line: number): number | undefined
}
