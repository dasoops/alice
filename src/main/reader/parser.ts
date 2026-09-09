import type { Chapter } from './chapter'
import { TxtParser } from './txt/txt-parser'
import { PathLike } from 'node:fs'

export type BookType = 'txt' | 'epub'

export type Metadata = {
  type: BookType
  path: PathLike
  name: string
  author: string
}

// 统一解析结果: 单文本缓冲 + 章节表 + 元数据, Reader 阅读与 WebDav 同步共用
export type Book = Metadata & {
  content: string
  chapters: Chapter[]
}

export interface Parser {
  parse(): Promise<Book>
}

// 按扩展名路由解析引擎; 未识别类型(含旧 .cache)按 txt 处理
export function createParser(filePath: string, options: { txtChapterRegexes: RegExp[] }): Parser {
  return new TxtParser(filePath, options.txtChapterRegexes)
}
