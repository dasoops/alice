import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conf } from 'electron-conf'
import type { EpubFile, EpubToc } from '@lingo-reader/epub-parser'
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

// 以 spine/toc/章节 html 构造假 EpubFile, 避免测试依赖真实 epub 文件
function fakeEpub(htmlById: Record<string, string>, toc: EpubToc = []): EpubFile {
  return {
    getMetadata: () => ({ title: '书名', creator: [{ contributor: '作者' }] }),
    getSpine: () => [
      { id: 'c1', href: 'Text/chap1.xhtml' },
      { id: 'c2', href: 'Text/chap2.xhtml' },
      { id: 'nav', href: 'Text/nav.xhtml', linear: 'no' },
      { id: 'cover', href: 'Text/cover.xhtml' }
    ],
    getToc: () => toc,
    loadChapter: async (id: string) => {
      const html = htmlById[id]
      if (!html) return undefined
      return { html, css: [] }
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
