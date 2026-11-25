import { EventEmitter } from 'node:events'
import { lineSeparator } from '../../constants'
import type { Book as BaseBook, BookEvents, Chapter, Position, Volume } from '../book'
import { findChapterAt, type TxtChapter } from './toc'

export class Book extends EventEmitter<BookEvents> implements BaseBook {
  readonly type = 'txt' as const
  readonly path: string
  readonly name: string
  readonly author = ''
  readonly content: string

  readonly chapters: TxtChapter[]
  readonly volumes: Volume[]
  private index = 0

  private _chapter: TxtChapter

  constructor({
    filePath,
    name,
    content,
    chapters,
    // txt 无目录层级, 默认退化为单个无标题卷
    volumes = [{ head: chapters[0]?.index ?? 0, start: 0, end: chapters.length }]
  }: {
    filePath: string
    name: string
    content: string
    chapters: TxtChapter[]
    volumes?: Volume[]
  }) {
    super()
    this.path = filePath
    this.name = name
    this.content = content
    this.chapters = chapters
    this.volumes = volumes
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
    // 保留原始字符偏移, 由渲染层以该偏移为页首锚点
    this.index = Math.max(target, chapter.beginChar)
    this.syncChapter()
  }

  chapter(): Chapter {
    return this._chapter
  }

  chapterText(): string {
    return this.content.substring(this._chapter.beginChar, this._chapter.endChar)
  }

  percentAt(chapterPos: number): number {
    if (this.content.length === 0) return 0
    const length = this._chapter.endChar - this._chapter.beginChar
    const pos = Math.min(Math.max(chapterPos, 0), length)
    return (this._chapter.beginChar + pos) / this.content.length
  }

  moveChapter(delta: -1 | 1): boolean {
    const target = this.chapters.find((it) => it.index === this._chapter.index + delta)
    if (!target) return false
    // 向前翻时停在章尾字符, 渲染层会据此选择上一章末页
    this.index = delta > 0 ? target.beginChar : Math.max(target.beginChar, target.endChar - 1)
    this.syncChapter()
    return true
  }

  lines(): { current: number; total: number } {
    return {
      current: this.content.substring(0, this.index + 1).split(lineSeparator).length,
      total: this.content.split(lineSeparator).length
    }
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
