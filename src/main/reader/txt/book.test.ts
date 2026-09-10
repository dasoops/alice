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

const paging = { maxLine: 1, chunkSize: 40 }

describe('Book', () => {
  it('共享章节表直接暴露内部偏移章节', () => {
    expect(makeBook().chapters).toEqual([
      { index: 0, title: '前言', beginChar: 0, endChar: 5 },
      { index: 1, title: '第1章 开始', beginChar: 5, endChar: 16 },
      { index: 2, title: '第2章 结束', beginChar: 16, endChar: 26 }
    ])
  })

  it('position 与章内字符偏移互相换算', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 2 })
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 2 })
    book.setPosition({ chapterIndex: 0, chapterPos: 3 })
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 3 })
  })

  it('无章节表时全书视为单章, 章内位置即字符位置', () => {
    const book = new Book({ filePath: 'x', name: 'x', content: 'abc', chapters: [] })
    book.setPosition({ chapterIndex: 3, chapterPos: 2 })
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 2 })
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

  it('readPage 返回当前页文本并推进定位', () => {
    const book = makeBook()
    // offset 0 读当前页, 定位不动; 翻页才前进到下一页开头
    expect(book.readPage(0, paging)).toBe('前言内容')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
    expect(book.readPage(1, paging)).toBe('\n第1章 开始')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 4 })
  })

  it('chapter 反映当前定位', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 2 })
    expect(book.chapter()).toEqual({ index: 1, title: '第1章 开始', beginChar: 5, endChar: 16 })
  })

  it('跨章时 emit chapter 事件, 携带新旧章节', () => {
    const book = makeBook()
    const changes: [Chapter | undefined, Chapter | undefined][] = []
    book.on('chapter', (current, previous) => changes.push([current, previous]))
    book.setPosition({ chapterIndex: 0, chapterPos: 0 })
    book.setPosition({ chapterIndex: 1, chapterPos: 0 })
    book.setPosition({ chapterIndex: 1, chapterPos: 1 })
    expect(changes).toEqual([
      [{ index: 0, title: '前言', beginChar: 0, endChar: 5 }, undefined],
      [
        { index: 1, title: '第1章 开始', beginChar: 5, endChar: 16 },
        { index: 0, title: '前言', beginChar: 0, endChar: 5 }
      ]
    ])
  })

  it('行号计算与跳转', () => {
    const book = makeBook()
    expect(book.totalLine()).toBe(5)
    expect(book.jumpLine!(1)).toBe(0)
    expect(book.jumpLine!(4)).toBe(16)
    expect(book.position()).toEqual({ chapterIndex: 2, chapterPos: 0 })
    expect(book.jumpLine!(99)).toBeUndefined()
  })
})
