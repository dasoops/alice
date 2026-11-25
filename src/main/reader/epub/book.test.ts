import { describe, expect, it } from 'vitest'
import type { Chapter } from '../book'
import { Book } from './book'

const text1 = ['第一章内容A', '第一章内容B'].join('\n')
const text2 = ['第二章内容C', '第二章内容D'].join('\n')

const makeBook = (): Book =>
  new Book({
    filePath: 'a.epub',
    name: '书名',
    author: '作者',
    chapters: [
      { index: 0, title: '第1章', id: 'c1', text: text1 },
      { index: 1, title: '第2章', id: 'c2', text: text2 }
    ]
  })

describe('Book', () => {
  it('章节表直接暴露章内文本章节', () => {
    const chapters = makeBook().chapters
    expect(chapters.map((it) => it.title)).toEqual(['第1章', '第2章'])
    expect(chapters[0].text).toBe(text1)
  })

  it('position 与章内字符偏移互相换算', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 7 })
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 7 })
    expect(book.chapter()).toEqual({ index: 1, title: '第2章', id: 'c2', text: text2 })
  })

  it('chapterIndex/chapterPos 越界时 clamp', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: -1, chapterPos: -5 })
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
    book.setPosition({ chapterIndex: 99, chapterPos: 999 })
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: text2.length })
  })

  it('chapterText 返回当前章完整正文', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 7 })
    expect(book.chapterText()).toBe(text2)
  })

  it('percentAt 按全书字符偏移换算并 clamp 到章内', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 0, chapterPos: 0 })
    expect(book.percentAt(0)).toBe(0)
    expect(book.percentAt(13)).toBe(13 / 26)
    expect(book.percentAt(999)).toBe(13 / 26)
    book.setPosition({ chapterIndex: 1, chapterPos: 0 })
    expect(book.percentAt(0)).toBe(13 / 26)
    expect(book.percentAt(13)).toBe(1)
  })

  it('moveChapter 前后移动, 边界返回 false', () => {
    const book = makeBook()
    expect(book.moveChapter(1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 0 })
    expect(book.moveChapter(1)).toBe(false)
    expect(book.moveChapter(-1)).toBe(true)
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: text1.length - 1 })
    expect(book.moveChapter(-1)).toBe(false)
  })

  it('跨章时 emit chapter 事件, 携带新旧章节', () => {
    const book = makeBook()
    const changes: [Chapter, Chapter | undefined][] = []
    book.on('chapter', (current, previous) => changes.push([current, previous]))
    book.moveChapter(1)
    expect(changes).toEqual([
      [
        { index: 1, title: '第2章', id: 'c2', text: text2 },
        { index: 0, title: '第1章', id: 'c1', text: text1 }
      ]
    ])
  })
})
