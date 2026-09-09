import * as fs from 'node:fs'
import path from 'path'
import type { Parser, Book } from '../parser'
import { buildToc } from './toc'
import { normalizeText } from './text'

export class TxtParser implements Parser {
  constructor(
    private readonly filePath: string,
    private readonly chapterRegexes: RegExp[]
  ) {}

  async parse(): Promise<Book> {
    const content = normalizeText(await fs.promises.readFile(this.filePath, 'utf-8'))
    return {
      type: 'txt',
      path: this.filePath,
      name: path.basename(this.filePath, path.extname(this.filePath)),
      author: '',
      content,
      chapters: buildToc(this.chapterRegexes, content)
    }
  }
}
