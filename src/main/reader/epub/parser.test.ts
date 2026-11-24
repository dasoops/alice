import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conf } from 'electron-conf'
import type { EpubFile, EpubToc, ManifestItem } from '@lingo-reader/epub-parser'
import { initEpubFile } from '@lingo-reader/epub-parser'
import { createParser } from '../parser'
import { Parser } from './parser'
import { Book } from './book'
import type { Config } from '../config'

// parser 经 util 间接依赖 electron 的 app/ipcMain, 测试环境无 electron 运行时
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { emit: vi.fn() }
}))

vi.mock('@lingo-reader/epub-parser', () => ({
  initEpubFile: vi.fn()
}))

const initEpubFileMock = vi.mocked(initEpubFile)

type FakeSpineItem = { id: string; href: string; linear?: 'no' }

const defaultSpine: FakeSpineItem[] = [
  { id: 'c1', href: 'Text/chap1.xhtml' },
  { id: 'c2', href: 'Text/chap2.xhtml' },
  { id: 'nav', href: 'Text/nav.xhtml', linear: 'no' },
  { id: 'cover', href: 'Text/cover.xhtml' }
]

// 以 spine/toc/章节 html 构造假 EpubFile, 避免测试依赖真实 epub 文件;
// manifest/resolveHref 按 spine href 派生, 供 adapter 的 legado 章节表换算使用;
// navToc 缺省同 toc, 用于区分"读平铺目录"与"读带层级 nav"两条分卷路径
function fakeEpub(
  htmlById: Record<string, string>,
  toc: EpubToc = [],
  spine: FakeSpineItem[] = defaultSpine,
  navToc: EpubToc = toc
): EpubFile {
  const manifest: Record<string, ManifestItem> = {}
  const baseToId = new Map<string, string>()
  for (const item of spine) {
    manifest[item.id] = { id: item.id, href: item.href, mediaType: 'application/xhtml+xml' }
    baseToId.set(item.href, item.id)
  }
  return {
    getMetadata: () => ({ title: '书名', creator: [{ contributor: '作者' }] }),
    getManifest: () => manifest,
    getSpine: () =>
      spine.map((item) => ({
        id: item.id,
        href: `epub:${item.href}`,
        mediaType: 'application/xhtml+xml',
        ...(item.linear ? { linear: item.linear } : {})
      })),
    getToc: () => toc,
    getNavToc: () => navToc,
    getGuide: () => [],
    loadChapter: async (id: string) => {
      const html = htmlById[id]
      if (!html) return undefined
      return { html, css: [] }
    },
    resolveHref: (href: string) => {
      if (!href.startsWith('epub:')) return undefined
      const [urlPath, fragment] = href.slice(5).split('#')
      const id = baseToId.get(urlPath)
      if (!id) return undefined
      return { id, selector: fragment ? `[id="${fragment}"]` : '' }
    },
    destroy: vi.fn()
  } as unknown as EpubFile
}

describe('Parser', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-epub-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('按 spine 构建章节, 标题取目录, 元数据落入 Book', async () => {
    const epub = fakeEpub(
      {
        c1: '<html><body><p>第一章内容</p></body></html>',
        c2: '<html><body><p>第二章内容</p></body></html>',
        cover: '<html><body></body></html>'
      },
      [
        { label: '第一章', href: 'epub:Text/chap1.xhtml', id: 'c1', playOrder: '1' },
        { label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '2' }
      ]
    )
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    expect(book.type).toBe('epub')
    expect(book.name).toBe('书名')
    expect(book.author).toBe('作者')
    expect(book.chapters.map((it) => it.title)).toEqual(['第一章', '第二章'])
    expect(book.chapters[0].text).toBe('第一章内容')
    expect(epub.destroy).toHaveBeenCalled()
  })

  it('无文本章节跳过, 无目录标题时用文件名兜底', async () => {
    const epub = fakeEpub({ c1: '<html><body><p>内容</p></body></html>' })
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].title).toBe('chap1')
    expect(book.chapters[0].index).toBe(0)
  })

  it('卷首页(空正文)被本地跳过但仍占 legado index, 每章 legadoIndex 相对 index 后移', async () => {
    const epub = fakeEpub(
      {
        front: '<html><body></body></html>',
        c1: '<html><body><p>第一章内容</p></body></html>',
        c2: '<html><body><p>第二章内容</p></body></html>'
      },
      [
        { label: '第一章', href: 'epub:Text/chap1.xhtml', id: 'c1', playOrder: '1' },
        { label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '2' }
      ],
      [
        { id: 'front', href: 'Text/front.xhtml' },
        { id: 'c1', href: 'Text/chap1.xhtml' },
        { id: 'c2', href: 'Text/chap2.xhtml' }
      ]
    )
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    // legado 侧: 卷首页 front=0, 第一章=1, 第二章=2; 本地仅展示正文两章
    expect(book.chapters.map((it) => it.title)).toEqual(['第一章', '第二章'])
    expect(book.chapters.map((it) => it.legadoIndex)).toEqual([1, 2])
  })

  it('nav 有层级时按卷分组, 卷末感言归入所属卷且 volumes 覆盖 chapters', async () => {
    const navToc: EpubToc = [
      {
        label: '第一卷 起',
        href: '',
        id: '',
        playOrder: '1',
        children: [
          { label: '第一章', href: 'epub:Text/chap1.xhtml', id: 'c1', playOrder: '1' },
          { label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '2' }
        ]
      },
      {
        label: '第二卷 承',
        href: '',
        id: '',
        playOrder: '2',
        children: [
          { label: '第三章', href: 'epub:Text/chap3.xhtml', id: 'c3', playOrder: '3' },
          { label: '第一卷 卷末感言', href: 'epub:Text/chap4.xhtml', id: 'c4', playOrder: '4' }
        ]
      }
    ]
    const epub = fakeEpub(
      {
        c1: '<html><body><p>一</p></body></html>',
        c2: '<html><body><p>二</p></body></html>',
        c3: '<html><body><p>三</p></body></html>',
        c4: '<html><body><p>感言</p></body></html>'
      },
      navToc,
      [
        { id: 'c1', href: 'Text/chap1.xhtml' },
        { id: 'c2', href: 'Text/chap2.xhtml' },
        { id: 'c3', href: 'Text/chap3.xhtml' },
        { id: 'c4', href: 'Text/chap4.xhtml' }
      ],
      navToc
    )
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    expect(book.volumes.map((it) => it.title)).toEqual(['第一卷 起', '第二卷 承'])
    expect(book.volumes.map((it) => it.head)).toEqual([0, 2])
    expect(book.volumes.map((it) => it.end - it.start)).toEqual([2, 2])
    // 卷末感言标题以"第一卷"开头, 但属第二卷正文, 不应另起一卷
    const second = book.volumes[1]
    expect(book.chapters.slice(second.start, second.end).map((it) => it.title)).toEqual([
      '第三章',
      '第一卷 卷末感言'
    ])
    const flat = book.volumes.flatMap((volume) => book.chapters.slice(volume.start, volume.end))
    expect(flat).toHaveLength(book.chapters.length)
    flat.forEach((chapter, i) => expect(chapter).toBe(book.chapters[i]))
  })

  it('导航文档平铺时保持不分组(标题像卷也不猜)', async () => {
    const toc: EpubToc = [
      { label: '第一卷 起', href: 'epub:Text/v1.xhtml', id: 'v1', playOrder: '1' },
      { label: '第一章', href: 'epub:Text/chap1.xhtml', id: 'c1', playOrder: '2' },
      { label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '3' },
      { label: '第二卷 承', href: 'epub:Text/v2.xhtml', id: 'v2', playOrder: '4' },
      { label: '第三章', href: 'epub:Text/chap3.xhtml', id: 'c3', playOrder: '5' }
    ]
    const epub = fakeEpub(
      {
        v1: '<html><body><p>卷首页</p></body></html>',
        c1: '<html><body><p>一</p></body></html>',
        c2: '<html><body><p>二</p></body></html>',
        v2: '<html><body><p>卷首页</p></body></html>',
        c3: '<html><body><p>三</p></body></html>'
      },
      toc,
      [
        { id: 'v1', href: 'Text/v1.xhtml' },
        { id: 'c1', href: 'Text/chap1.xhtml' },
        { id: 'c2', href: 'Text/chap2.xhtml' },
        { id: 'v2', href: 'Text/v2.xhtml' },
        { id: 'c3', href: 'Text/chap3.xhtml' }
      ]
    )
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    // 章节标题虽以"第一卷/第二卷"开头, epub 平铺目录仍视为无卷结构, 由 popup 平铺展示
    expect(book.volumes).toHaveLength(1)
    expect(book.volumes[0]).toMatchObject({ head: 0, start: 0, end: book.chapters.length })
    expect(book.volumes[0]).not.toHaveProperty('title')
  })

  it('无导航文档时单卷平铺, 不回退 NCX 层级', async () => {
    // NCX(getToc) 即便有层级也不参与分卷: getNavToc 只返回 EPUB3 导航文档, 缺失时为空
    const ncxToc: EpubToc = [
      {
        label: '第一卷 起',
        href: '',
        id: '',
        playOrder: '1',
        children: [{ label: '第一章', href: 'epub:Text/chap1.xhtml', id: 'c1', playOrder: '1' }]
      },
      {
        label: '第二卷 承',
        href: '',
        id: '',
        playOrder: '2',
        children: [{ label: '第二章', href: 'epub:Text/chap2.xhtml', id: 'c2', playOrder: '2' }]
      }
    ]
    const epub = fakeEpub(
      {
        c1: '<html><body><p>一</p></body></html>',
        c2: '<html><body><p>二</p></body></html>'
      },
      ncxToc,
      [
        { id: 'c1', href: 'Text/chap1.xhtml' },
        { id: 'c2', href: 'Text/chap2.xhtml' }
      ],
      []
    )
    initEpubFileMock.mockResolvedValue(epub)

    const book = (await new Parser(path.join(dir, 'a.epub'), path.join(dir, 'res')).parse()) as Book

    expect(book.volumes).toHaveLength(1)
    expect(book.volumes[0]).toMatchObject({ head: 0, start: 0, end: book.chapters.length })
    expect(book.volumes[0]).not.toHaveProperty('title')
  })
})

describe('createParser', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-epub-router-'))
  })

  afterEach(() => {
    // createParser 为 epub 创建 mkdtemp 临时资源目录, 路由测试未走 parse 不清理, 这里统一回收
    for (const entry of fs.readdirSync(os.tmpdir())) {
      if (entry.startsWith('alice-epub-res-')) {
        fs.rmSync(path.join(os.tmpdir(), entry), { recursive: true, force: true })
      }
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('epub 扩展名(含大写)路由到 EpubParser', () => {
    const conf = { get: () => ({ chapterRegex: [] }) } as unknown as Conf<Config>
    for (const name of ['a.epub', 'b.EPUB']) {
      const parser = createParser(path.join(dir, name), conf)
      expect(parser).toBeInstanceOf(Parser)
    }
  })
})
