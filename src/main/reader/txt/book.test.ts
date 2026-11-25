import { describe, expect, it } from 'vitest'
import { lineSeparator } from '../../constants'
import { buildToc, compileRegexes } from './toc'
import { Book } from './book'
import type { Chapter } from '../book'

const content = ['前言内容', '第1章 开始', '正文A', '第2章 结束', '正文B'].join(lineSeparator)
// 偏移表: 前言[0,5) 第1章[5,16) 第2章[16,26)
const makeBook = (): Book =>
  new Book({
    filePath: 'a.txt',
    name: '书名',
    content,
    chapters: buildToc(compileRegexes(['^\\s*第\\s*\\d+\\s*章']), content)
  })

describe('Book', () => {
  it('共享章节表直接暴露内部偏移章节', () => {
    expect(makeBook().chapters).toEqual([
      { index: 0, title: '前言', beginChar: 0, endChar: 5, legadoIndex: 0 },
      { index: 1, title: '第1章 开始', beginChar: 5, endChar: 16, legadoIndex: 1 },
      { index: 2, title: '第2章 结束', beginChar: 16, endChar: 26, legadoIndex: 2 }
    ])
  })

  it('position 与章内字符偏移互相换算', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 2 })
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 2 })
    book.setPosition({ chapterIndex: 0, chapterPos: 3 })
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 3 })
  })

  it('chapterIndex 越界时 clamp 到首/末章', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: -1, chapterPos: 0 })
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
    book.setPosition({ chapterIndex: 99, chapterPos: 0 })
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 0 })
  })

  it('章内位置越界时切到下章并保留位置(clamp 到章尾)', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 100 })
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 10 })
    book.setPosition({ chapterIndex: 2, chapterPos: 100 })
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 10 })
  })

  it('chapterText 返回当前章完整正文', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 7 })
    expect(book.chapterText()).toBe(['第1章 开始', '正文A', ''].join(lineSeparator))
  })

  it('percentAt 按全书字符偏移换算并 clamp 到章内', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 0 })
    expect(book.percentAt(0)).toBe(5 / 26)
    expect(book.percentAt(11)).toBe(16 / 26)
    expect(book.percentAt(999)).toBe(16 / 26)
    book.setPosition({ chapterIndex: 2, chapterPos: 10 })
    expect(book.percentAt(10)).toBe(1)
  })

  it('moveChapter 前后移动, 边界返回 false', () => {
    const book = makeBook()
    expect(book.moveChapter(1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 0 })
    expect(book.moveChapter(1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 0 })
    expect(book.moveChapter(1)).toBe(false)

    expect(book.moveChapter(-1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 10 })
    expect(book.moveChapter(-1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 4 })
    expect(book.moveChapter(-1)).toBe(false)
  })

  it('chapter 反映当前定位', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 2 })
    expect(book.chapter()).toEqual({
      index: 1,
      title: '第1章 开始',
      beginChar: 5,
      endChar: 16,
      legadoIndex: 1
    })
  })

  it('跨章时 emit chapter 事件, 携带新旧章节', () => {
    const book = makeBook()
    const changes: [Chapter, Chapter | undefined][] = []
    book.on('chapter', (current, previous) => changes.push([current, previous]))
    book.moveChapter(1)
    expect(changes).toEqual([
      [
        { index: 1, title: '第1章 开始', beginChar: 5, endChar: 16, legadoIndex: 1 },
        { index: 0, title: '前言', beginChar: 0, endChar: 5, legadoIndex: 0 }
      ]
    ])
  })

  it('行号计算与跳转', () => {
    const book = makeBook()
    expect(book.lines!().total).toBe(5)
    expect(book.jumpLine!(1)).toBe(0)
    expect(book.jumpLine!(4)).toBe(16)
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 0 })
    expect(book.jumpLine!(99)).toBeUndefined()
  })

  it('仅一章时章内进度与全书进度一致', () => {
    const content = 'abc\ndef'
    const book = new Book({
      filePath: 'a.txt',
      name: '书名',
      content,
      chapters: buildToc([], content)
    })
    expect(book.chapters).toHaveLength(1)
    expect(book.chapterText()).toBe(content)
    expect(book.percentAt(4)).toBe(4 / 7)
    expect(book.percentAt(7)).toBe(1)
  })
})
