import { describe, expect, it, vi } from 'vitest'
import { lineSeparator } from '../constants'
import { buildToc, compileChapterRegexes } from './toc'

describe('compileChapterRegexes', () => {
  it('编译全部有效正则', () => {
    const regexes = compileChapterRegexes(['^第\\d+章', '^\\s*第\\s*\\d+\\s*章'])
    expect(regexes).toHaveLength(2)
    expect(regexes[0].test('第1章 开始')).toBe(true)
  })

  it('跳过无效正则并回调上报', () => {
    const onInvalid = vi.fn()
    const regexes = compileChapterRegexes(['^第\\d+章', '[无效'], onInvalid)
    expect(regexes).toHaveLength(1)
    expect(onInvalid).toHaveBeenCalledWith('[无效')
  })

  it('全部无效时返回空数组', () => {
    expect(compileChapterRegexes(['[a-', '('])).toHaveLength(0)
  })
})

describe('buildToc', () => {
  const defaultRegexes = compileChapterRegexes(['^\\s*第\\s*\\d+\\s*章'])

  it('无正则时返回空目录', () => {
    expect(buildToc([], '第1章 开始' + lineSeparator)).toEqual([])
  })

  it('无匹配标题时返回空目录', () => {
    expect(buildToc(defaultRegexes, '正文一' + lineSeparator + '正文二')).toEqual([])
  })

  it('解析多个章节并正确计算偏移', () => {
    const content =
      '前言内容' +
      lineSeparator +
      '第1章 开始' +
      lineSeparator +
      '正文A' +
      lineSeparator +
      '第2章 结束' +
      lineSeparator +
      '正文B'
    expect(buildToc(defaultRegexes, content)).toEqual([
      { index: 0, title: '前言', beginChar: 0, endChar: 5 },
      { index: 1, title: '第1章 开始', beginChar: 5, endChar: 16 },
      { index: 2, title: '第2章 结束', beginChar: 16, endChar: 26 }
    ])
  })

  it('末章 endChar 为全文长度', () => {
    const content =
      '第1章 开始' +
      lineSeparator +
      '正文A' +
      lineSeparator +
      '第2章 结束' +
      lineSeparator +
      '正文B'
    const chapters = buildToc(defaultRegexes, content)
    expect(chapters.at(-1)?.endChar).toBe(content.length)
    expect(chapters).toHaveLength(2)
  })

  it('首个标题前仅有空白时不生成前言章节', () => {
    const content = lineSeparator + lineSeparator + '第1章 开始' + lineSeparator + '正文'
    const chapters = buildToc(defaultRegexes, content)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('第1章 开始')
    expect(chapters[0].beginChar).toBe(2)
  })

  it('兼容无空格的章节标题', () => {
    const content = '第12章标题行' + lineSeparator + '正文'
    const chapters = buildToc(defaultRegexes, content)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('第12章标题行')
  })

  it('正则锚定行首, 行中出现标题样式不匹配', () => {
    const content = '文中提到第1章的内容' + lineSeparator + '正文'
    expect(buildToc(defaultRegexes, content)).toEqual([])
  })

  it('空行不参与匹配', () => {
    // 空行虽为空串, 即使正则可匹配空串也应被排除
    const regexes = compileChapterRegexes(['^$'])
    expect(buildToc(regexes, '正文' + lineSeparator + lineSeparator + '正文')).toEqual([])
  })

  it('多个正则时任一匹配即认定标题', () => {
    const regexes = compileChapterRegexes(['^\\s*第\\s*\\d+\\s*章', '^楔子'])
    const content = '楔子' + lineSeparator + '正文' + lineSeparator + '第1章 开始'
    const chapters = buildToc(regexes, content)
    expect(chapters.map((it) => it.title)).toEqual(['楔子', '第1章 开始'])
    expect(chapters[1].index).toBe(1)
  })
})
