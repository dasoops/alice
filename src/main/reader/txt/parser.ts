import * as fs from 'node:fs'
import path from 'path'
import type { Book, Parser as BaseParser } from '../parser'
import { buildToc } from './toc'
import { normalizeText } from './text'
import { Book as TxtBook } from './book'

export class Parser implements BaseParser {
  constructor(
    private readonly filePath: string,
    private readonly chapterRegexes: RegExp[]
  ) {}

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
