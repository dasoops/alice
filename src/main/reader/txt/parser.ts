import * as fs from 'node:fs'
import path from 'path'
import type { Book, Parser as BaseParser } from '../parser'
import { buildToc, compileRegexes } from './toc'
import { normalizeText } from './text'
import { Book as TxtBook } from './book'
import { TxtConfig } from '../config'
import { error } from '../../util'

export class Parser implements BaseParser {
  private readonly chapterRegexes: RegExp[]

  constructor(
    private readonly filePath: string,
    private readonly conf: TxtConfig
  ) {
    this.chapterRegexes = compileRegexes(this.conf.chapterRegex ?? [], (pattern) =>
      error(`无效的章节正则: ${pattern}`)
    )
  }

  async parse(): Promise<Book> {
    const content = normalizeText(await fs.promises.readFile(this.filePath, 'utf-8'))
    return new TxtBook({
      filePath: this.filePath,
      name: path.basename(this.filePath, path.extname(this.filePath)),
      content,
      chapters: buildToc(this.chapterRegexes, content)
    })
  }
}
