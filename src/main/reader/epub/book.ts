import { EventEmitter } from 'node:events'
import type { Book as BaseBook, BookEvents, Chapter, Position, Volume } from '../book'

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
  readonly volumes: Volume[]

  private chapterIndex = 0
  private chapterPos = 0
  private _chapter: EpubChapter
  // 各章起始字符在全书中的偏移, 用于按字符数加权计算全书进度
  private readonly chapterOffsets: number[]
  private readonly totalChars: number

  constructor({
    filePath,
    name,
    author,
    chapters,
    // 直接构造时无目录层级, 退化为单个无标题卷; 正式解析由 parser 按 nav 层级给出
    volumes = [{ head: chapters[0]?.index ?? 0, start: 0, end: chapters.length }]
  }: {
    filePath: string
    name: string
    author: string
    chapters: EpubChapter[]
    volumes?: Volume[]
  }) {
    super()
    this.path = filePath
    this.name = name
    this.author = author
    this.chapters = chapters
    this.volumes = volumes
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

  setPosition({ chapterIndex, chapterPos }: Position): void {
    const index = this.clampChapterIndex(chapterIndex)
    const chapter = this.chapters[index]
    // 章内位置保留原始偏移, 由渲染层以该偏移为页首锚点
    this.chapterPos = Math.min(Math.max(chapterPos, 0), chapter.text.length)
    this.chapterIndex = index
    this.syncChapter()
  }

  chapter(): Chapter {
    return this._chapter
  }

  chapterText(): string {
    return this.chapters[this.chapterIndex].text
  }

  percentAt(chapterPos: number): number {
    if (this.totalChars === 0) return 0
    const chapter = this.chapters[this.chapterIndex]
    const pos = Math.min(Math.max(chapterPos, 0), chapter.text.length)
    return (this.chapterOffsets[this.chapterIndex] + pos) / this.totalChars
  }

  moveChapter(delta: -1 | 1): boolean {
    const target = this.chapterIndex + delta
    if (target < 0 || target >= this.chapters.length) return false
    this.chapterIndex = target
    // 向前翻时停在章尾字符, 渲染层会据此选择上一章末页
    this.chapterPos = delta > 0 ? 0 : Math.max(0, this.chapters[target].text.length - 1)
    this.syncChapter()
    return true
  }

  private clampChapterIndex(chapterIndex: number): number {
    if (chapterIndex < 0) return 0
    if (chapterIndex > this.chapters.length - 1) return this.chapters.length - 1
    return chapterIndex
  }

  private syncChapter(): void {
    const previous = this._chapter
    const current = this.chapters[this.chapterIndex]
    if (current === previous) return
    this._chapter = current
    this.emit('chapter', current, previous)
  }
}
