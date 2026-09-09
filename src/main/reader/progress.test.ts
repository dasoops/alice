import { describe, expect, it } from 'vitest'
import {
  bookProgressFileName,
  compareProgress,
  replaceReservedChar,
  type BookProgress,
  type SyncMode
} from './progress'

const progress = (chapterIndex: number, pos: number): BookProgress => ({
  name: 'name',
  author: '',
  durChapterIndex: chapterIndex,
  durChapterPos: pos,
  durChapterTime: 0,
  durChapterTitle: ''
})

describe('compareProgress', () => {
  const compare = (mode: SyncMode, a: BookProgress, b: BookProgress): number =>
    compareProgress(mode, a, b)

  it('章节号优先于章内位置', () => {
    expect(compare('approximate', progress(2, 0), progress(1, 999))).toBeGreaterThan(0)
    expect(compare('approximate', progress(1, 999), progress(2, 0))).toBeLessThan(0)
  })

  it('同章比较章内位置', () => {
    expect(compare('approximate', progress(3, 100), progress(3, 50))).toBeGreaterThan(0)
    expect(compare('approximate', progress(3, 50), progress(3, 100))).toBeLessThan(0)
  })

  it('相等时为 0, 与时间戳无关', () => {
    const a = progress(3, 50)
    const b = { ...progress(3, 50), durChapterTime: 12345 }
    expect(compare('approximate', a, b)).toBe(0)
  })

  it('chapter 模式忽略章内位置, 仅按章节号比较', () => {
    expect(compare('chapter', progress(3, 0), progress(3, 999))).toBe(0)
    expect(compare('chapter', progress(4, 0), progress(3, 999))).toBeGreaterThan(0)
    expect(compare('chapter', progress(3, 999), progress(4, 0))).toBeLessThan(0)
  })
})

describe('bookProgressFileName', () => {
  // 对应坚果云 bookProgress 目录下的真实文件名格式: name_author.json
  it('普通书名与作者', () => {
    expect(bookProgressFileName('诡秘之主', '爱潜水的乌贼')).toBe('诡秘之主_爱潜水的乌贼.json')
  })

  it('空作者', () => {
    expect(bookProgressFileName('某某', '')).toBe('某某_.json')
  })

  it('normalize 非法文件名字符', () => {
    expect(bookProgressFileName('a/b\\c:d*e?f"g<h>i|j', '')).toBe('a_b_c_d_e_f_g_h_i_j_.json')
  })

  it('replaceReservedChar 逐字符编码且不二次编码', () => {
    expect(replaceReservedChar('%')).toBe('%25')
    expect(replaceReservedChar('a b"c#d&e(f)g+h,i/j:k;l<m=n>o?p@q\\r|s')).toBe(
      'a%20b%22c%23d%26e%28f%29g%2Bh%2Ci%2Fj%3Ak%3Bl%3Cm%3Dn%3Eo%3Fp%40q%5Cr%7Cs'
    )
  })

  it('百分号先编码, 后续替换不会二次编码', () => {
    expect(replaceReservedChar('100% ')).toBe('100%25%20')
  })

  it('组合: normalize 先于 replaceReservedChar', () => {
    expect(bookProgressFileName('书: 名/字', '作?者')).toBe('书_%20名_字_作_者.json')
  })
})
