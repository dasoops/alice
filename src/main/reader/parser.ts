import type { Chapter } from './toc'
import { TxtParser } from './txt-parser'

export type BookType = 'txt' | 'epub'

// 统一解析结果: 单文本缓冲 + 章节表 + 元数据, Reader 阅读与 WebDav 同步共用
export type ParsedBook = {
  type: BookType
  name: string
  author: string
  content: string
  chapters: Chapter[]
}

export interface BookParser {
  parse(): Promise<ParsedBook>
}

// 按扩展名路由解析引擎; 未识别类型(含旧 .cache)按 txt 处理
export function createParser(
  filePath: string,
  options: { txtChapterRegexes: RegExp[] }
): BookParser {
  return new TxtParser(filePath, options.txtChapterRegexes)
}
