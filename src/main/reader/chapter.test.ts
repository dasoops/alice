import { describe, expect, it } from 'vitest'
import { findChapterAt } from './chapter'

describe('findChapterAt', () => {
  const chapters = [
    { index: 0, title: '前言', beginChar: 0, endChar: 5 },
    { index: 1, title: '第1章', beginChar: 5, endChar: 16 },
    { index: 2, title: '第2章', beginChar: 16, endChar: 26 }
  ]

  it('命中章节内部', () => {
    expect(findChapterAt(chapters, 7)?.title).toBe('第1章')
    expect(findChapterAt(chapters, 20)?.title).toBe('第2章')
  })

  it('边界偏移归属下一章(左闭右开)', () => {
    expect(findChapterAt(chapters, 5)?.title).toBe('第1章')
    expect(findChapterAt(chapters, 16)?.title).toBe('第2章')
  })

  it('首章前返回 undefined', () => {
    expect(findChapterAt(chapters, -1)).toBeUndefined()
  })

  it('末章末尾(全文末尾)仍属于末章', () => {
    expect(findChapterAt(chapters, 25)?.title).toBe('第2章')
  })

  it('空 toc 返回 undefined', () => {
    expect(findChapterAt([], 10)).toBeUndefined()
  })
})
