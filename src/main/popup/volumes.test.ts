import { describe, expect, it } from 'vitest'
import { buildChapterGroups } from './volumes'
import type { PopupChapter } from './types'

const chapter = (index: number, title: string): PopupChapter => ({ index, title })

describe('buildChapterGroups', () => {
  it('无卷标题时等价平铺为单个无标题组', () => {
    const chapters = [chapter(0, '前言'), chapter(1, '第一章'), chapter(2, '第二章')]
    expect(buildChapterGroups(chapters)).toEqual([{ chapters, collapsible: false }])
  })

  it('空目录返回空分组', () => {
    expect(buildChapterGroups([])).toEqual([])
  })

  it('卷首 + 至少 2 个正文章节时可折叠', () => {
    const chapters = [
      chapter(0, '第1卷 1~50'),
      chapter(1, '第一章'),
      chapter(2, '第二章'),
      chapter(3, '第三章')
    ]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      title: '第1卷 1~50',
      head: 0,
      collapsible: true,
      chapters
    })
  })

  it('卷内只有 1 个正文章节时不折叠', () => {
    const chapters = [chapter(0, '第一卷 起'), chapter(1, '第一章')]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('第一卷 起')
    expect(groups[0].collapsible).toBe(false)
  })

  it('连续卷头且卷内无章节时不折叠', () => {
    const chapters = [chapter(0, '第一卷 上'), chapter(1, '第二卷 下')]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.head)).toEqual([0, 1])
    expect(groups.every((group) => group.collapsible)).toBe(false)
  })

  it('末尾卷头(卷内无章节)不折叠', () => {
    const chapters = [
      chapter(0, '第一卷 上'),
      chapter(1, '第一章'),
      chapter(2, '第二章'),
      chapter(3, '第二卷 下')
    ]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(2)
    expect(groups[0].collapsible).toBe(true)
    expect(groups[1]).toMatchObject({ title: '第二卷 下', head: 3, collapsible: false })
    expect(groups[1].chapters).toEqual([chapters[3]])
  })

  it('首卷之前的章节归入无标题组', () => {
    const chapters = [
      chapter(0, '封面'),
      chapter(1, '前言'),
      chapter(2, '第1卷 1~50'),
      chapter(3, '第一章'),
      chapter(4, '第二章')
    ]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      chapters: [chapters[0], chapters[1]],
      collapsible: false
    })
    expect(groups[0]).not.toHaveProperty('title')
    expect(groups[0]).not.toHaveProperty('head')
    expect(groups[1]).toMatchObject({ title: '第1卷 1~50', head: 2, collapsible: true })
  })

  it('识别中文数字、阿拉伯数字与英文卷号', () => {
    const titles = [
      '第1卷 1~50',
      '第一卷 风起',
      '第 12 卷 终章',
      '卷3 起',
      '卷 十二 终',
      'Volume 1',
      'VOL.2',
      'volume 3 extra'
    ]
    for (const title of titles) {
      const groups = buildChapterGroups([chapter(0, title), chapter(1, 'a'), chapter(2, 'b')])
      expect(groups).toHaveLength(1)
      expect(groups[0].title).toBe(title)
      expect(groups[0].collapsible).toBe(true)
    }
  })

  it('普通章节标题不被误判为卷', () => {
    const chapters = [chapter(0, '第1章 开始'), chapter(1, '第十二章 结束'), chapter(2, '序章')]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(1)
    expect(groups[0]).not.toHaveProperty('title')
    expect(groups[0].collapsible).toBe(false)
  })

  it('分组后 index/title 不丢失且顺序保持', () => {
    const chapters = [
      chapter(0, '前言'),
      chapter(1, '第1卷 1~50'),
      chapter(2, '第一章'),
      chapter(3, '第二章'),
      chapter(4, '第二卷 51~100'),
      chapter(5, '第五十一章')
    ]
    const groups = buildChapterGroups(chapters)
    expect(groups).toHaveLength(3)
    expect(groups.flatMap((group) => group.chapters)).toEqual(chapters)
    expect(groups.map((group) => group.chapters.map((item) => item.index))).toEqual([
      [0],
      [1, 2, 3],
      [4, 5]
    ])
    expect(groups[2].collapsible).toBe(false)
  })
})
