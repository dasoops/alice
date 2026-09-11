import { EventEmitter } from 'node:events'
import type { Book as BaseBook, BookEvents, Chapter, PageOptions, Position } from '../book'
import { nextPage, pageRange } from '../paging'

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
  }

  position(): Position {
    return { chapterIndex: this.chapterIndex, chapterPos: this.chapterPos }
  }

  setPosition({ chapterIndex, chapterPos }: Position): void {
    const index = this.clampChapterIndex(chapterIndex)
    this.chapterIndex = index
    this.chapterPos = Math.min(Math.max(chapterPos, 0), this.chapters[index].text.length)
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

  readPage(offset: number, options: PageOptions): string {
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
          this.chapterPos = this.chapters[this.chapterIndex].text.length
          this.syncChapter()
          return this.page(-1, options)
        }
        // 首张时停留在首页
      }
    }
    return this.page(offset, options)
  }

  private page(offset: number, options: PageOptions): string {
    const chapter = this.chapters[this.chapterIndex]
    const { begin, end } = pageRange(chapter.text, this.chapterPos, offset, options)
    this.chapterPos = begin
    this.syncChapter()
    return chapter.text.substring(begin, end)
  }

  private syncChapter(): void {
    const previous = this._chapter
    const current = this.chapters[this.chapterIndex]
    if (current === previous) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }
}
