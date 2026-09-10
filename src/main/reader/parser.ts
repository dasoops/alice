import type { Book } from './book'
import { TxtParser } from './txt'

export interface Parser {
  parse(): Promise<Book>
}

export function createParser(filePath: string, options: { txtChapterRegexes: RegExp[] }): Parser {
  return new TxtParser(filePath, options.txtChapterRegexes)
}

export type { Book, BookType, Position } from './book'
