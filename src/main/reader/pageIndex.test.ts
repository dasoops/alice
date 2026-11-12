import { describe, expect, it } from 'vitest'
import { ChapterPageIndex } from './pageIndex'

const options = { maxLine: 99, chunkSize: 4 }

const info = (
  index: ChapterPageIndex,
  overrides: Partial<Parameters<ChapterPageIndex['info']>[0]>
): { current: number; total: number } =>
  index.info({
    chapterIndex: 0,
    content: 'abcdefghij',
    from: 0,
    end: 10,
    index: 0,
    options,
    ...overrides
  })

describe('ChapterPageIndex', () => {
  it('把章内定位换算为页码', () => {
    const index = new ChapterPageIndex()
    expect(info(index, { index: 0 })).toEqual({ current: 1, total: 3 })
    expect(info(index, { index: 4 })).toEqual({ current: 2, total: 3 })
    expect(info(index, { index: 9 })).toEqual({ current: 3, total: 3 })
  })

  it('支持章节内容在全文中的非零起点', () => {
    const index = new ChapterPageIndex()
    expect(info(index, { content: 'xxabcdefghij', from: 2, end: 12, index: 6 })).toEqual({
      current: 2,
      total: 3
    })
  })

  it('分页参数变化后重新计算', () => {
    const index = new ChapterPageIndex()
    expect(info(index, { index: 4 })).toEqual({ current: 2, total: 3 })
    expect(info(index, { index: 4, options: { maxLine: 99, chunkSize: 6 } })).toEqual({
      current: 1,
      total: 2
    })
  })

  it('同一章节的文本区间变化后重新计算', () => {
    const index = new ChapterPageIndex()
    expect(info(index, { index: 4 })).toEqual({ current: 2, total: 3 })
    expect(info(index, { index: 4, from: 4 })).toEqual({ current: 1, total: 2 })
  })

  it('不同章节分别缓存', () => {
    const index = new ChapterPageIndex()
    expect(info(index, { chapterIndex: 0, content: 'abcdef', end: 6 })).toEqual({
      current: 1,
      total: 2
    })
    expect(info(index, { chapterIndex: 1 })).toEqual({ current: 1, total: 3 })
  })

  it('align 返回包含定位的页起点', () => {
    const index = new ChapterPageIndex()
    const align = (at: number): number =>
      index.align({
        chapterIndex: 0,
        content: 'abcdefghij',
        from: 0,
        end: 10,
        index: at,
        options
      })
    expect(align(0)).toBe(0)
    expect(align(3)).toBe(0)
    expect(align(4)).toBe(4)
    expect(align(7)).toBe(4)
    expect(align(99)).toBe(8)
  })
})
