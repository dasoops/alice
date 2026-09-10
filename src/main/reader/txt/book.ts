import { EventEmitter } from 'node:events'
import { lineSeparator } from '../../constants'
import type { Book as BaseBook, BookEvents, Chapter, PageOptions, Position } from '../book'
import { pageRange } from '../paging'
import { findChapterAt, type TxtChapter } from './toc'

export class Book extends EventEmitter<BookEvents> implements BaseBook {
  readonly type = 'txt' as const
  readonly path: string
  readonly name: string
  readonly author = ''
  readonly content: string

  readonly chapters: TxtChapter[]
  private index = 0

  // 首章前或 toc 为空时为 undefined
  private _chapter?: TxtChapter

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
  }

  position(): Position {
    if (!this._chapter) return { chapterIndex: 0, chapterPos: this.index }
    return { chapterIndex: this._chapter.index, chapterPos: this.index - this._chapter.beginChar }
  }

  setPosition({ chapterIndex, chapterPos }: Position): void {
    // 无章节表时全书视为单章, 章内位置即字符位置
    if (this.chapters.length === 0) {
      this.index = chapterPos
      this.syncChapter()
      return
    }
    let chapter = this.chapterAt(chapterIndex)
    // 章内越界保持既有跳转行为: 超章尾切下章头, 无下章(末章)时停在章尾
    if (chapter.beginChar + chapterPos > chapter.endChar) {
      chapter = this.chapters.find((it) => it.index === chapter.index + 1) ?? chapter
    }
    const target = Math.min(chapter.beginChar + chapterPos, chapter.endChar)
    this.index = Math.max(target, chapter.beginChar)
    this.syncChapter()
  }

  chapter(): Chapter | undefined {
    return this._chapter
  }

  readPage(offset: number, options: PageOptions): string {
    const { begin, end } = pageRange(this.content, this.index, offset, options)
    this.index = begin
    this.syncChapter()
    return this.content.substring(begin, end)
  }

  currentLine(): number {
    return this.content.substring(0, this.index + 1).split(lineSeparator).length
  }

  totalLine(): number {
    return this.content.split(lineSeparator).length
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
    if (current === previous) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }

  private chapterAt(chapterIndex: number): TxtChapter {
    if (chapterIndex < 0) return this.chapters[0]
    if (chapterIndex > this.chapters.length - 1) return this.chapters.at(-1)!
    return this.chapters.find((it) => it.index === chapterIndex) ?? this.chapters[0]
  }
}
