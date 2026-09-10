import type { Book } from './book'
import { TxtParser } from './txt'
import { Conf } from 'electron-conf'
import type { Config } from './config'

export interface Parser {
  parse(): Promise<Book>
}

export function createParser(filePath: string, conf: Conf<Config>): Parser {
  return new TxtParser(filePath, conf.get('txt'))
}

export type { Book, BookType, Position } from './book'
