import type { Book } from './book'
import { TxtParser } from './txt'

export interface Parser {
  parse(): Promise<Book>
}

// 按扩展名路由解析引擎; 未识别类型(含旧 .cache)按 txt 处理
export function createParser(filePath: string, options: { txtChapterRegexes: RegExp[] }): Parser {
  return new TxtParser(filePath, options.txtChapterRegexes)
}

export type { Book, BookType, Position } from './book'
