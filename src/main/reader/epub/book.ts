import { EventEmitter } from 'node:events'
import type {
  Book as BaseBook,
  BookEvents,
  Chapter,
  PageOptions,
  PageRead,
  Position,
  ReadingProgress
} from '../book'
import { nextPage, pageRange } from '../paging'
import { ChapterPageIndex } from '../pageIndex'

// 每章独立文本, 章内位置即字符偏移, 与 txt 的 beginChar 语义一致
export type EpubChapter = Chapter & {
  id: string
  text: string
}

export class Book extends EventEmitter<BookEvents> implements BaseBook {
  readonly type = 'epub' as const
  readonly path: string
  readonly name: string
  readonly author: string
  readonly chapters: EpubChapter[]

  private chapterIndex = 0
  private chapterPos = 0
  private _chapter: EpubChapter
  // 各章起始字符在全书中的偏移, 用于按字符数加权计算全书进度
  private readonly chapterOffsets: number[]
  private readonly totalChars: number
  private readonly pageIndex = new ChapterPageIndex()

  constructor({
    filePath,
    name,
    author,
    chapters
  }: {
    filePath: string
    name: string
    author: string
    chapters: EpubChapter[]
  }) {
    super()
    this.path = filePath
    this.name = name
    this.author = author
    this.chapters = chapters
    if (chapters.length === 0) throw Error('epub 章节表为空')
    this._chapter = chapters[0]

    this.chapterOffsets = []
    let offset = 0
    for (const chapter of chapters) {
      this.chapterOffsets.push(offset)
      offset += chapter.text.length
    }
    this.totalChars = offset
  }

  position(): Position {
    return { chapterIndex: this.chapterIndex, chapterPos: this.chapterPos }
  }

  setPosition({ chapterIndex, chapterPos }: Position, options?: PageOptions): void {
    const index = this.clampChapterIndex(chapterIndex)
    const chapter = this.chapters[index]
    let pos = Math.min(Math.max(chapterPos, 0), chapter.text.length)
    // 恢复位置可能落在页中间, 首次读取前吸附到页起点, 保证页码与翻页网格一致;
    // 代价是位置最多回退一页
    if (options) {
      pos = this.pageIndex.align({
        chapterIndex: index,
        content: chapter.text,
        from: 0,
        end: chapter.text.length,
        index: pos,
        options
      })
    }
    this.chapterIndex = index
    this.chapterPos = pos
    this.syncChapter()
  }

  private clampChapterIndex(chapterIndex: number): number {
    if (chapterIndex < 0) return 0
    if (chapterIndex > this.chapters.length - 1) return this.chapters.length - 1
    return chapterIndex
  }

  chapter(): Chapter {
    return this._chapter
  }

  readingProgress(options: PageOptions, pageEnd?: number, withPageInfo = true): ReadingProgress {
    const chapter = this.chapters[this.chapterIndex]
    // 优先复用 readPage 返回的页尾, 单独请求进度时再按当前位置计算
    const end = pageEnd ?? nextPage(chapter.text, this.chapterPos, 0, options)
    const percent =
      this.totalChars > 0 ? (this.chapterOffsets[this.chapterIndex] + end) / this.totalChars : 0

    if (!withPageInfo) return { chapterTitle: chapter.title, percent }

    const { current, total } = this.pageIndex.info({
      chapterIndex: this.chapterIndex,
      content: chapter.text,
      from: 0,
      end: chapter.text.length,
      index: this.chapterPos,
      options
    })
    const atEnd =
      this.totalChars > 0 && this.chapterOffsets[this.chapterIndex] + end >= this.totalChars
    return {
      chapterTitle: chapter.title,
      page: atEnd ? total : current,
      pageTotal: total,
      percent
    }
  }

  readPage(offset: number, options: PageOptions): PageRead {
    const chapter = this.chapters[this.chapterIndex]
    if (offset > 0) {
      // 下一页起点越过章尾即已在章末页, 切换到下一章
      if (nextPage(chapter.text, this.chapterPos, 1, options) >= chapter.text.length) {
        if (this.chapterIndex + 1 < this.chapters.length) {
          this.chapterIndex++
          this.chapterPos = 0
          this.syncChapter()
          return this.page(0, options)
        }
        // 末章时停留在末页
      }
    } else if (offset < 0) {
      // 当前位置落在章首页内时前翻切上章末页; 首章时停留在首页
      if (this.chapterPos < nextPage(chapter.text, 0, 0, options)) {
        if (this.chapterIndex > 0) {
          this.chapterIndex--
          const previous = this.chapters[this.chapterIndex]
          // 末页可能不足 maxLine 行, 从章尾反向计算会多退一页;
          // 直接用页网格的最后一页起点, 保证前翻后仍是上一章末页
          const starts = this.pageIndex.starts({
            chapterIndex: this.chapterIndex,
            content: previous.text,
            from: 0,
            end: previous.text.length,
            options
          })
          this.chapterPos = starts.at(-1)!
          this.syncChapter()
          return this.page(0, options)
        }
        // 首张时停留在首页
      }
    }
    return this.page(offset, options)
  }

  private page(offset: number, options: PageOptions): PageRead {
    const chapter = this.chapters[this.chapterIndex]
    const { begin, end } = pageRange(chapter.text, this.chapterPos, offset, options)
    this.chapterPos = begin
    this.syncChapter()
    return { content: chapter.text.substring(begin, end), end }
  }

  private syncChapter(): void {
    const previous = this._chapter
    const current = this.chapters[this.chapterIndex]
    if (current === previous) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }
}
