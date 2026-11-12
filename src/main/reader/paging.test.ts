import { describe, expect, it } from 'vitest'
import { pageInfo, pageRange, pageStarts } from './paging'

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

describe('pageStarts', () => {
  const chunked = { maxLine: 99, chunkSize: 4 }

  it('按 chunkSize 切页并在 end 处截断末页', () => {
    expect(pageStarts('abcdefghij', 0, 7, chunked)).toEqual([0, 4])
  })

  it('空区间仍返回一页, 避免出现 0/0', () => {
    expect(pageStarts('', 0, 0, chunked)).toEqual([0])
  })

  it('分页参数非法时不死循环', () => {
    expect(pageStarts('abcdef', 0, 6, { maxLine: 1, chunkSize: 0 })).toEqual([0])
  })
})

describe('pageInfo', () => {
  const starts = [0, 4, 8]

  it('页码从 1 开始', () => {
    expect(pageInfo(starts, 0)).toEqual({ current: 1, total: 3 })
    expect(pageInfo(starts, 4)).toEqual({ current: 2, total: 3 })
    expect(pageInfo(starts, 9)).toEqual({ current: 3, total: 3 })
  })

  it('定位在末页之后时归入末页', () => {
    expect(pageInfo(starts, 99)).toEqual({ current: 3, total: 3 })
  })
})
