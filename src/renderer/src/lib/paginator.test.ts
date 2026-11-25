import { describe, expect, it } from 'vitest'
import { findPageEnd, findPageStart, pageStartsAround, textToHtml } from './paginator'

describe('textToHtml', () => {
  it('按行 trim 并丢弃空行, 与旧渲染行为一致', () => {
    expect(textToHtml(' 第一行 \n\n 第二行\n')).toBe('第一行<br />第二行')
  })

  it('空文本渲染为空', () => {
    expect(textToHtml(' \n\n ')).toBe('')
  })
})

describe('findPageEnd', () => {
  const text = '1\n2\n3\n4\n5'
  // 用行数模拟容量, 不依赖 DOM
  const fitsLines =
    (start: number, lines: number) =>
    (end: number): boolean =>
      textToHtml(text.substring(start, end)).split('<br />').filter(Boolean).length <= lines

  it('找到当前页能容纳的最大字符数', () => {
    expect(findPageEnd(text, 0, fitsLines(0, 3))).toBe(6)
  })

  it('非零起点也按绝对偏移切页', () => {
    // 从 "3" 开始, 两行应到 "4" 后的换行处
    expect(findPageEnd(text, 4, fitsLines(4, 2))).toBe(8)
  })

  it('容量再小也至少返回一个字符, 避免死循环', () => {
    expect(findPageEnd(text, 0, fitsLines(0, 0))).toBe(1)
  })

  it('连续多页时每页都从上一页的绝对页尾继续', () => {
    const many = '1\n2\n3\n4\n5\n6\n7\n8\n9'
    const fits =
      (start: number, lines: number) =>
      (end: number): boolean =>
        textToHtml(many.substring(start, end)).split('<br />').filter(Boolean).length <= lines
    const starts = [0]
    let start = 0
    while (start < many.length) {
      const end = findPageEnd(many, start, fits(start, 2))
      if (end <= start) break
      start = end
      if (start < many.length) starts.push(start)
    }
    expect(starts).toEqual([0, 4, 8, 12, 16])
  })
})

describe('findPageStart', () => {
  const text = '1\n2\n3\n4\n5'
  const fitsLines =
    (end: number, lines: number) =>
    (start: number): boolean =>
      textToHtml(text.substring(start, end)).split('<br />').filter(Boolean).length <= lines

  it('找到上一页能容纳的最早起点', () => {
    expect(findPageStart(9, fitsLines(9, 2))).toBe(5)
  })

  it('整段都放得下时返回章首', () => {
    expect(findPageStart(9, fitsLines(9, 99))).toBe(0)
  })
})

describe('pageStartsAround', () => {
  const text = '1\n2\n3\n4\n5'
  const fits = (start: number, end: number): boolean =>
    textToHtml(text.substring(start, end)).split('<br />').filter(Boolean).length <= 2

  it('当前页起点始终等于 anchor', () => {
    const slice = pageStartsAround(text, 4, fits)
    expect(slice.starts[slice.currentIndex]).toBe(4)
    expect(slice.starts).toEqual([0, 4, 8])
  })

  it('anchor 为章首时等价于从前往后分页', () => {
    const slice = pageStartsAround(text, 0, fits)
    expect(slice.currentIndex).toBe(0)
    expect(slice.starts[0]).toBe(0)
  })

  it('不同容量下当前页首始终等于 anchor', () => {
    for (const lines of [1, 2, 3]) {
      const slice = pageStartsAround(
        text,
        4,
        (start, end) =>
          textToHtml(text.substring(start, end)).split('<br />').filter(Boolean).length <= lines
      )
      expect(slice.starts[slice.currentIndex]).toBe(4)
    }
  })
})

describe('分页初值', () => {
  const text = '1\n2\n3\n4\n5\n6\n7\n8\n9'
  const fitsLines =
    (lines: number) =>
    (end: number): boolean =>
      textToHtml(text.substring(0, end)).split('<br />').filter(Boolean).length <= lines

  it('初值大于实际页长时向下收敛', () => {
    expect(findPageEnd(text, 0, fitsLines(2), 100)).toBe(4)
  })

  it('初值小于实际页长时继续倍增', () => {
    expect(findPageEnd(text, 0, fitsLines(6), 1)).toBe(12)
  })
})
