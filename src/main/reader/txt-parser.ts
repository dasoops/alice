import * as fs from 'node:fs'
import path from 'path'
import type { BookParser, ParsedBook } from './parser'
import { buildToc } from './toc'
import { normalizeText } from './text'

export class TxtParser implements BookParser {
  constructor(
    private readonly filePath: string,
    private readonly chapterRegexes: RegExp[]
  ) {}

  async parse(): Promise<ParsedBook> {
    const content = normalizeText(await fs.promises.readFile(this.filePath, 'utf-8'))
    return {
      type: 'txt',
      name: path.basename(this.filePath, path.extname(this.filePath)),
      author: '',
      content,
      chapters: buildToc(this.chapterRegexes, content)
    }
  }
}
