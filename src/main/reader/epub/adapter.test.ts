import { describe, expect, it } from 'vitest'
import type { EpubFile, GuideReference, ManifestItem, NavPoint } from '@lingo-reader/epub-parser'
import { buildEpubLegadoMap } from './adapter'

// 以 spine/toc/guide 构造假 EpubFile, resolveHref 按 manifest base href 解析, 与真实解析器行为一致
function fakeEpub({
  spine,
  toc,
  guide
}: {
  spine: { id: string; linear?: 'no' }[]
  toc?: NavPoint[]
  guide?: GuideReference[]
}): EpubFile {
  const ids = new Set(spine.map((item) => item.id))
  const collect = (items: NavPoint[] | undefined): void => {
    for (const item of items ?? []) {
      ids.add(item.id)
      collect(item.children)
    }
  }
  collect(toc)
  for (const ref of guide ?? []) ids.add(idOfHref(ref.href))

  const manifest: Record<string, ManifestItem> = {}
  const baseToId = new Map<string, string>()
  for (const id of ids) {
    const href = `Text/${id}.xhtml`
    manifest[id] = { id, href, mediaType: 'application/xhtml+xml' }
    baseToId.set(href, id)
  }

  const spineItems = spine.map((item) => ({
    id: item.id,
    href: `epub:Text/${item.id}.xhtml`,
    mediaType: 'application/xhtml+xml',
    ...(item.linear ? { linear: item.linear } : {})
  }))

  return {
    getManifest: () => manifest,
    getSpine: () => spineItems,
    getToc: () => toc ?? [],
    getGuide: () => guide ?? [],
    resolveHref: (href: string) => {
      if (!href.startsWith('epub:')) return undefined
      const [urlPath, fragment] = href.slice(5).split('#')
      const id = baseToId.get(urlPath)
      if (!id) return undefined
      return { id, selector: fragment ? `[id="${fragment}"]` : '' }
    }
  } as unknown as EpubFile
}

const nav = (id: string, label: string, children?: NavPoint[]): NavPoint => ({
  id,
  label,
  href: `epub:Text/${id}.xhtml`,
  playOrder: '1',
  children
})

// 卷容器节点无资源, href 为空, 在 lingo-reader 中无法解析
const volume = (label: string, children: NavPoint[]): NavPoint => ({
  id: label,
  label,
  href: '',
  playOrder: '1',
  children
})

const idOfHref = (href: string): string => {
  const raw = href.startsWith('epub:') ? href.slice(5) : href
  return raw
    .split('#')[0]
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '')
}

describe('buildEpubLegadoMap', () => {
  it('封面/扉页偏移: 本地跳过 linear=no 的封面, legadoIndex 相对本地 index 后移', () => {
    // legado: 封面(0) + 第1章(1) + 第2章(2); alice 不展示封面
    const epub = fakeEpub({
      spine: [{ id: 'cover', linear: 'no' }, { id: 'chap1' }, { id: 'chap2' }],
      guide: [{ title: '封面', type: 'cover', href: 'epub:Text/cover.xhtml' }],
      toc: [nav('chap1', '第1章'), nav('chap2', '第2章')]
    })
    const map = buildEpubLegadoMap(epub)

    expect(map.toLegadoById('chap1')).toBe(1)
    expect(map.toLegadoById('chap2')).toBe(2)
  })

  it('卷容器节点占 index: 本地章节 legadoIndex 相对自身 index 后移', () => {
    const epub = fakeEpub({
      spine: [{ id: 'chap1' }, { id: 'chap2' }],
      toc: [volume('第一卷', [nav('chap1', '第1章'), nav('chap2', '第2章')])]
    })
    const map = buildEpubLegadoMap(epub)

    expect(map.toLegadoById('chap1')).toBe(1)
    expect(map.toLegadoById('chap2')).toBe(2)
  })

  it('无目录: 退回全 spine 顺序对齐, 含被 alice 跳过的章节', () => {
    const epub = fakeEpub({
      spine: [{ id: 'cover', linear: 'no' }, { id: 'chap1' }, { id: 'chap2' }]
    })
    const map = buildEpubLegadoMap(epub)

    expect(map.toLegadoById('chap1')).toBe(1)
    expect(map.toLegadoById('chap2')).toBe(2)
  })

  it('空正文/纯图资源: 本地不展示但占用 legado index(卷首页)', () => {
    const epub = fakeEpub({
      spine: [{ id: 'front' }, { id: 'chap1' }, { id: 'chap2' }],
      toc: [nav('chap1', '第1章'), nav('chap2', '第2章')]
    })
    // front 正文为空被 alice 跳过, 但仍占据 legado index 0
    const map = buildEpubLegadoMap(epub)

    expect(map.toLegadoById('chap1')).toBe(1)
  })

  it('目录引用的资源不在 spine 时: 仍占用 legado index', () => {
    const epub = fakeEpub({
      spine: [{ id: 'chap1' }],
      toc: [nav('chap1', '第1章'), nav('appendix', '附录')]
    })
    const map = buildEpubLegadoMap(epub)

    expect(map.toLegadoById('appendix')).toBe(1)
  })

  it('同一资源被卷首页与目录条目引用时, 推送采用目录条目 index', () => {
    const epub = fakeEpub({
      spine: [{ id: 'cover' }, { id: 'chap1' }, { id: 'chap2' }],
      guide: [{ title: '封面', type: 'cover', href: 'epub:Text/cover.xhtml' }],
      toc: [nav('chap2', '第2章'), nav('chap1', '第1章')]
    })
    const map = buildEpubLegadoMap(epub)

    // 目录里 chap2 在 chap1 之前, 卷首页阶段误把 chap1 记为 index 1, 目录阶段覆盖为 3
    expect(map.toLegadoById('chap1')).toBe(3)
    expect(map.toLegadoById('chap2')).toBe(2)
  })
})
