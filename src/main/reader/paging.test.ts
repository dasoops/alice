import { describe, expect, it } from 'vitest'
import { pageRange } from './paging'

const content = '前言\n第1章\n正文'
const paging = { maxLine: 1, chunkSize: 40 }

describe('pageRange', () => {
  it('offset 0 读取当前页', () => {
    expect(pageRange(content, 0, 0, paging)).toEqual({ begin: 0, end: 2 })
  })

  it('下一页从上一页结束处推进', () => {
    expect(pageRange(content, 0, 1, paging)).toEqual({ begin: 2, end: 6 })
  })

  it('上一页回退到当前页起始', () => {
    expect(pageRange(content, 6, -1, paging)).toEqual({ begin: 2, end: 6 })
  })

  it('已达尾页时回退取一页', () => {
    expect(pageRange(content, content.length, 1, paging)).toEqual({ begin: 6, end: 9 })
  })

  it('已达首页时从头取一页', () => {
    expect(pageRange(content, 0, -1, paging)).toEqual({ begin: 0, end: 2 })
  })
})
