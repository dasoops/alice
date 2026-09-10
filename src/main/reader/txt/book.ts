import { lineSeparator } from '../../constants'
import type { Book as BaseBook, Chapter, PageOptions, Position } from '../book'
import { pageRange } from '../paging'
import { findChapterAt, type TxtChapter } from './toc'

// 全文文本 + 全局字符 index 是 txt 的独有定位模型, 全部封装在内部;
// 对外仅暴露跨格式统一的 {chapterIndex, chapterPos} 定位
export class Book implements BaseBook {
  readonly type = 'txt' as const
  readonly path: string
  readonly name: string
  readonly author = ''
  readonly chapters: Chapter[]
  readonly content: string

  private readonly offsetChapters: TxtChapter[]
  private index = 0
  private chapter?: TxtChapter

  constructor({
    filePath,
    name,
    content,
    offsetChapters
  }: {
    filePath: string
    name: string
    content: string
    offsetChapters: TxtChapter[]
  }) {
    this.path = filePath
    this.name = name
    this.content = content
    this.offsetChapters = offsetChapters
    this.chapters = offsetChapters.map(({ index, title }) => ({ index, title }))
  }

  position(): Position {
    const chapter = this.resolveChapter()
    if (!chapter) return { chapterIndex: 0, chapterPos: this.index }
    return { chapterIndex: chapter.index, chapterPos: this.index - chapter.beginChar }
  }

  setPosition({ chapterIndex, chapterPos }: Position): void {
    // 无章节表时全书视为单章, 章内位置即字符位置
    if (this.offsetChapters.length === 0) {
      this.index = chapterPos
      return
    }
    let chapter = this.chapterAt(chapterIndex)
    // 章内越界保持既有跳转行为: 超章尾切下章头, 无下章(末章)时停在章尾
    if (chapter.beginChar + chapterPos > chapter.endChar) {
      chapter = this.offsetChapters.find((it) => it.index === chapter.index + 1) ?? chapter
    }
    const target = Math.min(chapter.beginChar + chapterPos, chapter.endChar)
    this.index = Math.max(target, chapter.beginChar)
    this.chapter = chapter
  }

  currentChapter(): Chapter | undefined {
    const chapter = this.resolveChapter()
    return chapter ? { index: chapter.index, title: chapter.title } : undefined
  }

  readPage(offset: number, options: PageOptions): string {
    const { begin, end } = pageRange(this.content, this.index, offset, options)
    this.index = begin
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
    return index
  }

  private chapterAt(chapterIndex: number): TxtChapter {
    if (chapterIndex < 0) return this.offsetChapters[0]
    if (chapterIndex > this.offsetChapters.length - 1) return this.offsetChapters.at(-1)!
    return this.offsetChapters.find((it) => it.index === chapterIndex) ?? this.offsetChapters[0]
  }

  // 最近包含字符 index 的章节, 命中已知当前章时跳过遍历
  private resolveChapter(index: number = this.index): TxtChapter | undefined {
    this.chapter = findChapterAt(this.offsetChapters, index, this.chapter)
    return this.chapter
  }
}
