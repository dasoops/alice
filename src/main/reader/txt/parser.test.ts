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
    const parsed = await new Parser(filePath, { chapterRegex: ['^\\s*第\\s*\\d+\\s*章'] }).parse()

    expect(parsed.type).toBe('txt')
    expect(parsed.name).toBe('书名')
    expect(parsed.author).toBe('')
    expect(parsed).toBeInstanceOf(Book)
    expect((parsed as Book).content).toBe(
      ['前言', '第1章 开始', '正文A', '第2章 结束', '正文B'].join(lineSeparator)
    )
    expect(parsed.chapters.map((it) => it.title)).toEqual(['前言', '第1章 开始', '第2章 结束'])
  })

  it('无匹配章节时章节表为空', async () => {
    const filePath = write('无章节.txt', '只有正文')
    const parsed = await new Parser(filePath, { chapterRegex: ['^第\\d+章'] }).parse()
    expect(parsed.chapters).toEqual([])
    expect((parsed as Book).content).toBe('只有正文')
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
