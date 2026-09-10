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

const paging = { maxLine: 1, chunkSize: 40 }

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

  it('readPage 返回当前页文本并推进定位', () => {
    const book = makeBook()
    expect(book.readPage(0, paging)).toBe('第一章内容A')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
    expect(book.readPage(1, paging)).toBe('\n第一章内容B')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 6 })
  })

  it('下一页触章尾时切换到下章首页', () => {
    const book = makeBook()
    const changes: [Chapter | undefined, Chapter | undefined][] = []
    book.on('chapter', (current, previous) => changes.push([current, previous]))
    book.setPosition({ chapterIndex: 0, chapterPos: text1.length })
    expect(book.readPage(1, paging)).toBe('第二章内容C')
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 0 })
    expect(changes).toEqual([
      [{ index: 0, title: '第1章', id: 'c1', text: text1 }, undefined],
      [
        { index: 1, title: '第2章', id: 'c2', text: text2 },
        { index: 0, title: '第1章', id: 'c1', text: text1 }
      ]
    ])
  })

  it('上一页触章头时切换到上章末页', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: 0 })
    expect(book.readPage(-1, paging)).toBe('\n第一章内容B')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 6 })
  })

  it('首章头向前翻页停留首页', () => {
    const book = makeBook()
    expect(book.readPage(-1, paging)).toBe('第一章内容A')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
  })

  it('末章尾向后翻页停留末页', () => {
    const book = makeBook()
    book.setPosition({ chapterIndex: 1, chapterPos: text2.length })
    expect(book.readPage(1, paging)).toBe('\n第二章内容D')
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 6 })
  })

  it('无章节时返回空串且定位保持默认', () => {
    const book = new Book({ filePath: 'x.epub', name: 'x', author: '', chapters: [] })
    expect(book.readPage(0, paging)).toBe('')
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 0 })
    expect(book.chapter()).toBeUndefined()
  })

  it('章末页起点向后翻页应切到下章', () => {
    const book = new Book({
      filePath: 'a.epub',
      name: 'n',
      author: '',
      chapters: [
        // 末页为 [6, 46), 起点 6 距章尾不足一页
        { index: 0, title: 'c0', id: 'c0', text: ['1', '2', '3', 'X'.repeat(40)].join('\n') },
        { index: 1, title: 'c1', id: 'c1', text: '乙\n丙' }
      ]
    })
    book.setPosition({ chapterIndex: 0, chapterPos: 6 })
    expect(book.readPage(1, paging)).toBe('乙')
    expect(book.position()).toEqual({ chapterIndex: 1, chapterPos: 0 })
  })

  it('章首页内向前翻页应切到上章末页', () => {
    const book = new Book({
      filePath: 'a.epub',
      name: 'n',
      author: '',
      chapters: [
        // 首页为 [0, 3)
        { index: 0, title: 'c0', id: 'c0', text: ['1', '2', '3', 'X'.repeat(40)].join('\n') },
        { index: 1, title: 'c1', id: 'c1', text: '甲乙丙\n丁' }
      ]
    })
    book.setPosition({ chapterIndex: 1, chapterPos: 1 })
    expect(book.readPage(-1, paging)).toBe('X'.repeat(40))
    expect(book.position()).toEqual({ chapterIndex: 0, chapterPos: 6 })
  })
})
