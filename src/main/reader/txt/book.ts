import { EventEmitter } from 'node:events'
import { lineSeparator } from '../../constants'
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
import { findChapterAt, type TxtChapter } from './toc'

export class Book extends EventEmitter<BookEvents> implements BaseBook {
  readonly type = 'txt' as const
  readonly path: string
  readonly name: string
  readonly author = ''
  readonly content: string

  readonly chapters: TxtChapter[]
  private index = 0

  private _chapter: TxtChapter
  private readonly pageIndex = new ChapterPageIndex()

  constructor({
    filePath,
    name,
    content,
    chapters
  }: {
    filePath: string
    name: string
    content: string
    chapters: TxtChapter[]
  }) {
    super()
    this.path = filePath
    this.name = name
    this.content = content
    this.chapters = chapters
    if (chapters.length === 0) throw Error('txt 章节表为空')
    this._chapter = chapters[0]
  }

  position(): Position {
    return { chapterIndex: this._chapter.index, chapterPos: this.index - this._chapter.beginChar }
  }

  setPosition({ chapterIndex, chapterPos }: Position): void {
    let chapter = this.chapterAt(chapterIndex)
    // 章内越界保持既有跳转行为: 超章尾切下章头, 无下章(末章)时停在章尾
    if (chapter.beginChar + chapterPos > chapter.endChar) {
      chapter = this.chapters.find((it) => it.index === chapter.index + 1) ?? chapter
    }
    const target = Math.min(chapter.beginChar + chapterPos, chapter.endChar)
    // txt 分页连续覆盖全文, 章节内页起点与全局页边界不一定一致;
    // 这里忽略 Reader 传入的分页参数, 保留原始字符偏移, 不按章节页网格回退,
    // 避免跨端恢复时无谓改变阅读位置; 从非页首位置恢复时角标页码可能为近似值.
    this.index = Math.max(target, chapter.beginChar)
    this.syncChapter()
  }

  chapter(): Chapter {
    return this._chapter
  }

  readPage(offset: number, options: PageOptions): PageRead {
    const { begin, end } = pageRange(this.content, this.index, offset, options)
    this.index = begin
    this.syncChapter()
    return { content: this.content.substring(begin, end), end }
  }

  lines(): { current: number; total: number } {
    return {
      current: this.content.substring(0, this.index + 1).split(lineSeparator).length,
      total: this.content.split(lineSeparator).length
    }
  }

  readingProgress(options: PageOptions, pageEnd?: number, withPageInfo = true): ReadingProgress {
    // 页起点可能是上一页末尾的换行符, 章节归属应按该页首个正文字符判断
    const index = this.displayIndex()
    const chapter = findChapterAt(this.chapters, index, this._chapter) ?? this._chapter
    // 优先复用 readPage 返回的页尾, 单独请求进度时再按当前位置计算
    const end = pageEnd ?? nextPage(this.content, this.index, 0, options)
    const percent = this.content.length > 0 ? end / this.content.length : 0

    if (!withPageInfo) return { chapterTitle: chapter.title, percent }

    const { current, total } = this.pageIndex.info({
      chapterIndex: chapter.index,
      content: this.content,
      from: chapter.beginChar,
      end: this.contentEnd(chapter),
      index,
      options
    })
    return {
      chapterTitle: chapter.title,
      page: percent >= 1 ? total : current,
      pageTotal: total,
      percent
    }
  }

  // 跳过页首换行符; 返回内容末尾时由 findChapterAt 归入末章
  private displayIndex(): number {
    let index = this.index
    while (index < this.content.length && this.content[index] === lineSeparator) index++
    return index
  }

  // 章节末尾的换行符属于下一页内容, 计页时不纳入本章
  private contentEnd(chapter: TxtChapter): number {
    let end = chapter.endChar
    while (end > chapter.beginChar && this.content[end - 1] === lineSeparator) end--
    return end
  }

  jumpLine(line: number): number | undefined {
    let index = 0
    if (line > 1) {
      // 第4行: 跳过前2个分隔符, 找到第3行末尾分隔符, +1即为第4行起始点
      index = -1
      for (let n = 0; n < line - 1; n++) {
        index = this.content.indexOf(lineSeparator, index + 1)
        if (index === -1) break
      }
      if (index === -1) return undefined
      index++
    }
    this.index = index
    this.syncChapter()
    return index
  }

  private syncChapter(): void {
    const previous = this._chapter
    const current = findChapterAt(this.chapters, this.index, previous)
    // 首章 beginChar 恒为 0, 定位 index>=0 时必有章节, !current 仅为类型防御
    if (!current || current === previous) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }

  private chapterAt(chapterIndex: number): TxtChapter {
    if (chapterIndex < 0) return this.chapters[0]
    if (chapterIndex > this.chapters.length - 1) return this.chapters.at(-1)!
    return this.chapters.find((it) => it.index === chapterIndex) ?? this.chapters[0]
  }
}
