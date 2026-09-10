import path from 'path'
import os from 'node:os'
import * as fs from 'node:fs'
import type { Book } from './book'
import { TxtParser } from './txt'
import { EpubParser } from './epub'
import { Conf } from 'electron-conf'
import type { Config } from './config'

export interface Parser {
  parse(): Promise<Book>
}

export function createParser(filePath: string, conf: Conf<Config>): Parser {
  if (path.extname(filePath).toLowerCase() === '.epub') {
    // 解析中间产物使用临时目录, 解析后由 EpubParser 清理
    return new EpubParser(filePath, fs.mkdtempSync(path.join(os.tmpdir(), 'alice-epub-res-')))
  }
  return new TxtParser(filePath, conf.get('txt'))
}

export type { Book, BookType, Position } from './book'
