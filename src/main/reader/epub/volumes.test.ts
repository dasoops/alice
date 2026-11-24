import { describe, expect, it } from 'vitest'
import type { NavPoint } from '@lingo-reader/epub-parser'
import type { Chapter, Volume } from '../book'
import { buildVolumes } from './volumes'

const nav = (label: string, id: string, children: NavPoint[] = []): NavPoint => ({
  label,
  href: id ? `epub:${id}.xhtml` : '',
  id,
  playOrder: '',
  children
})

const chapters = (titles: string[]): Chapter[] => titles.map((title, index) => ({ index, title }))

const indexById = (entries: [string, number][]): Map<string, number> => new Map(entries)

// 区间不变量: 从 0 开始、首尾相接、覆盖全部章节, 且按区间切出的章节与输入逐项一致
function expectCovers(volumes: Volume[], list: Chapter[]): void {
  expect(volumes.length).toBeGreaterThan(0)
  expect(volumes[0].start).toBe(0)
  expect(volumes.at(-1)!.end).toBe(list.length)
  for (let i = 1; i < volumes.length; i++) {
    expect(volumes[i].start).toBe(volumes[i - 1].end)
  }
  const flat = volumes.flatMap((it) => list.slice(it.start, it.end))
  expect(flat).toHaveLength(list.length)
  flat.forEach((chapter, i) => expect(chapter).toBe(list[i]))
}

describe('buildVolumes', () => {
  it('空章节返回空数组', () => {
    expect(buildVolumes([], [], indexById([]))).toEqual([])
    expect(
      buildVolumes([], [nav('第一卷', 'v1', [nav('第一章', 'c1')])], indexById([['c1', 0]]))
    ).toEqual([])
  })

  it('平铺目录退化为单个无标题区间, head 取首章 index', () => {
    const list = chapters(['封面', '第一章', '第二章'])
    const volumes = buildVolumes(
      list,
      [nav('第一章', 'c1'), nav('第二章', 'c2')],
      indexById([
        ['c1', 1],
        ['c2', 2]
      ])
    )
    expect(volumes).toEqual([{ head: 0, start: 0, end: 3 }])
    expect(volumes[0]).not.toHaveProperty('title')
    expectCovers(volumes, list)
  })

  it('顶层带子节点成卷, 边界取首个可定位章节', () => {
    const list = chapters(['第一章', '第二章', '第三章', '第四章', '第五章'])
    const toc = [
      nav('上', 'v1', [nav('第一章', 'c1'), nav('第二章', 'c2')]),
      nav('下', 'v2', [nav('第三章', 'c3'), nav('第四章', 'c4')])
    ]
    const volumes = buildVolumes(
      list,
      toc,
      indexById([
        ['c1', 0],
        ['c2', 1],
        ['c3', 2],
        ['c4', 3]
      ])
    )
    expect(volumes.map((it) => it.title)).toEqual(['上', '下'])
    expect(volumes.map((it) => [it.head, it.start, it.end])).toEqual([
      [0, 0, 2],
      [2, 2, 5]
    ])
    expectCovers(volumes, list)
  })

  it('容器节点无资源时取后代最小章节位置', () => {
    const list = chapters(['一', '二', '三', '四', '五'])
    const volumes = buildVolumes(
      list,
      [nav('第一卷', '', [nav('子卷', '', [nav('第一章', 'c2')])])],
      indexById([['c2', 3]])
    )
    expect(volumes).toHaveLength(2)
    expect(volumes[0]).toEqual({ head: 0, start: 0, end: 3 })
    expect(volumes[1]).toMatchObject({ title: '第一卷', head: 3, start: 3, end: 5 })
    expectCovers(volumes, list)
  })

  it('卷自身页码晚于子章节时仍取最小位置', () => {
    const list = chapters(['一', '二', '三', '四', '五'])
    const volumes = buildVolumes(
      list,
      [nav('第一卷', 'v1', [nav('第一章', 'c1'), nav('第二章', 'c2')])],
      indexById([
        ['v1', 8],
        ['c1', 2],
        ['c2', 3]
      ])
    )
    expect(volumes.map((it) => it.head)).toEqual([0, 2])
    expect(volumes[0]).not.toHaveProperty('title')
    expect(volumes[0]).toMatchObject({ start: 0, end: 2 })
    expect(volumes[1]).toMatchObject({ title: '第一卷', head: 2, start: 2, end: 5 })
    expectCovers(volumes, list)
  })

  it('空标题或未映射到章节的卷被跳过', () => {
    const list = chapters(['一', '二'])
    const volumes = buildVolumes(
      list,
      [
        nav('   ', 'v2', [nav('第二章', 'c2')]),
        nav('第一卷', 'missing', [nav('第一章', 'unknown')])
      ],
      indexById([['c2', 1]])
    )
    expect(volumes).toEqual([{ head: 0, start: 0, end: 2 }])
    expectCovers(volumes, list)
  })

  it('锚点前的前置组无标题, head 取首章 index', () => {
    const list = chapters(['封面', '前言', '第一章', '第二章'])
    const volumes = buildVolumes(
      list,
      [nav('第一卷', 'v1', [nav('第一章', 'c1')])],
      indexById([['c1', 2]])
    )
    expect(volumes[0]).toEqual({ head: 0, start: 0, end: 2 })
    expect(volumes[0]).not.toHaveProperty('title')
    expect(volumes[1]).toMatchObject({ title: '第一卷', head: 2, start: 2, end: 4 })
    expectCovers(volumes, list)
  })

  it('未被锚点覆盖的章节落入前一卷(如卷末感言)', () => {
    const list = chapters(['第一卷 起', '第一章', '第二章', '第一卷 卷末感言', '第二卷 承'])
    const volumes = buildVolumes(
      list,
      [
        nav('第一卷 起', 'v1', [nav('第一章', 'c1')]),
        nav('第二卷 承', 'v2', [nav('第三章', 'c3')])
      ],
      indexById([
        ['v1', 0],
        ['c1', 1],
        ['v2', 4],
        ['c3', 4]
      ])
    )
    expect(volumes.map((it) => it.title)).toEqual(['第一卷 起', '第二卷 承'])
    expect(volumes[0]).toMatchObject({ start: 0, end: 4 })
    expect(list.slice(volumes[0].start, volumes[0].end).map((it) => it.title)).toEqual([
      '第一卷 起',
      '第一章',
      '第二章',
      '第一卷 卷末感言'
    ])
    expectCovers(volumes, list)
  })

  it('重复/越界/乱序锚点: 排序去重后切分, 丢弃非法锚点', () => {
    const list = chapters(['一', '二', '三', '四'])
    const volumes = buildVolumes(
      list,
      [
        nav('第二卷', 'v2', [nav('第三章', 'c2')]),
        nav('第一卷', 'v1', [nav('第二章', 'c1')]),
        nav('重复卷头', 'dup', [nav('第三章', 'c2')]),
        nav('越界', 'out', [nav('不存在', 'c9')])
      ],
      indexById([
        ['c1', 1],
        ['c2', 2],
        ['c9', 4]
      ])
    )
    expect(volumes.map((it) => it.title)).toEqual([undefined, '第一卷', '第二卷'])
    expect(volumes.map((it) => [it.head, it.start, it.end])).toEqual([
      [0, 0, 1],
      [1, 1, 2],
      [2, 2, 4]
    ])
    expectCovers(volumes, list)
  })

  it('任意锚点组合下区间首尾相接并覆盖全部章节', () => {
    const list = chapters(['0', '1', '2', '3', '4', '5'])
    // 每组为 (title, 章节 index), 含无锚点/单锚点/相邻/乱序/重复/越界等组合
    const cases: { title: string; index: number }[][] = [
      [],
      [{ title: 'A', index: 0 }],
      [{ title: 'A', index: 5 }],
      [
        { title: 'A', index: 1 },
        { title: 'B', index: 3 }
      ],
      [
        { title: 'A', index: 3 },
        { title: 'B', index: 1 },
        { title: 'C', index: 3 }
      ],
      [
        { title: 'A', index: 0 },
        { title: 'B', index: 2 },
        { title: 'C', index: 4 }
      ],
      [
        { title: 'A', index: 2 },
        { title: 'B', index: 2 },
        { title: 'C', index: 99 }
      ]
    ]
    for (const spec of cases) {
      const toc = spec.map((item, i) => nav(item.title, `v${i}`, [nav(item.title, `c${i}`)]))
      const ids = indexById(spec.map((item, i) => [`c${i}`, item.index]))
      expectCovers(buildVolumes(list, toc, ids), list)
    }
  })
})
