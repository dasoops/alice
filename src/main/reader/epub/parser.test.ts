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
// manifest/resolveHref 按 spine href 派生, 供 adapter 的 legado 章节表换算使用
function fakeEpub(
  htmlById: Record<string, string>,
  toc: EpubToc = [],
  spine: FakeSpineItem[] = defaultSpine
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
