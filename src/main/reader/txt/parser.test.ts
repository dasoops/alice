import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Conf } from 'electron-conf'
import { lineSeparator } from '../../constants'
import { createParser } from '../parser'
import { Parser } from './parser'
import { Book } from './book'
import type { Config } from '../config'

// parser 经 util 间接依赖 electron 的 app/ipcMain, 测试环境无 electron 运行时
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { emit: vi.fn() }
}))

describe('Parser', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-txt-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, content: string): string => {
    const filePath = path.join(dir, name)
    fs.writeFileSync(filePath, content, 'utf-8')
    return filePath
  }

  it('归一化正文并按正则构建章节表', async () => {
    const filePath = write('书名.txt', '前言\r\n第1章 开始\n正文A\r\n第2章 结束\r\n正文B')
    const parsed = await new Parser(filePath, {
      chapterRegex: [{ pattern: '^\\s*第\\s*\\d+\\s*章', enabled: true }]
    }).parse()

    expect(parsed.type).toBe('txt')
    expect(parsed.name).toBe('书名')
    expect(parsed.author).toBe('')
    expect(parsed).toBeInstanceOf(Book)
    expect((parsed as Book).content).toBe(
      ['前言', '第1章 开始', '正文A', '第2章 结束', '正文B'].join(lineSeparator)
    )
    expect(parsed.chapters.map((it) => it.title)).toEqual(['前言', '第1章 开始', '第2章 结束'])
    // 前提 T1 下 txt 与 legado 章节表一致, legadoIndex 恒等于本地 index
    expect(parsed.chapters.map((it) => it.legadoIndex)).toEqual([0, 1, 2])
  })

  it('无匹配章节时全书作为单章', async () => {
    const filePath = write('无章节.txt', '只有正文')
    const parsed = await new Parser(filePath, {
      chapterRegex: [{ pattern: '^第\\d+章', enabled: true }]
    }).parse()
    expect(parsed.chapters).toEqual([
      { index: 0, title: '正文', beginChar: 0, endChar: 4, legadoIndex: 0 }
    ])
    expect((parsed as Book).content).toBe('只有正文')
  })

  it('txt 不做卷分组, 全部章节装入单个无标题卷', async () => {
    const filePath = write('分卷.txt', '第一卷 起\n第1章 A\n第2章 B\n第二卷 承\n第3章 C')
    const parsed = await new Parser(filePath, {
      chapterRegex: [
        { pattern: '^\\s*(?:第\\s*\\d+\\s*章|第\\s*[一二三四五六七八九十]+\\s*卷)', enabled: true }
      ]
    }).parse()

    // 章节标题虽像卷, txt 无目录结构, 由 popup 平铺展示
    expect(parsed.volumes).toHaveLength(1)
    expect(parsed.volumes[0]).toMatchObject({ head: 0, start: 0, end: parsed.chapters.length })
    expect(parsed.volumes[0]).not.toHaveProperty('title')
  })

  it('关闭的正则不参与章节匹配', async () => {
    const filePath = write('关闭正则.txt', '第1章 开始\r\n正文')
    const parsed = await new Parser(filePath, {
      chapterRegex: [{ pattern: '^第\\d+章', enabled: false }]
    }).parse()
    expect(parsed.chapters).toEqual([
      { index: 0, title: '正文', beginChar: 0, endChar: 9, legadoIndex: 0 }
    ])
  })
})

describe('createParser', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-router-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('非 epub 扩展名(含旧 .cache)路由到 Parser', async () => {
    for (const name of ['a.txt', 'b.cache', 'c']) {
      const filePath = path.join(dir, name)
      fs.writeFileSync(filePath, '正文', 'utf-8')
      const parser = createParser(filePath, {
        get: () => ({ chapterRegex: [] })
      } as unknown as Conf<Config>)
      expect(parser).toBeInstanceOf(Parser)
      const parsed = await parser.parse()
      expect(parsed.type).toBe('txt')
    }
  })
})
