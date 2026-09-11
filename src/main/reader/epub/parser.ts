import path from 'node:path'
import * as fs from 'node:fs'
import { initEpubFile, type EpubFile } from '@lingo-reader/epub-parser'
import type { Book, Parser as BaseParser } from '../parser'
import { Book as EpubBook, type EpubChapter } from './book'
import { htmlToText } from './html'
import { flattenToc } from './toc'
import { buildEpubLegadoMap } from './adapter'
import log from 'electron-log/main'

export class Parser implements BaseParser {
  constructor(
    private readonly filePath: string,
    private readonly resourceDir: string
  ) {}

  async parse(): Promise<Book> {
    const epub = await initEpubFile(this.filePath, this.resourceDir)
    try {
      return await this.build(epub)
    } finally {
      // destroy 的 unlink 为异步且不追踪 transformHTML 写出的 css, 直接整目录清理
      epub.destroy()
      fs.rmSync(this.resourceDir, { recursive: true, force: true })
    }
  }

  private async build(epub: EpubFile): Promise<Book> {
    const metadata = epub.getMetadata()
    log.debug('EpubParser ==> metadata: ' + JSON.stringify(metadata))
    const titleById = flattenToc(epub.getToc())
    const chapters: EpubChapter[] = []
    for (const item of epub.getSpine()) {
      // linear=no 为导航/封面等辅助页, 不进入阅读章节
      if (item.linear === 'no') continue
      const chapter = await epub.loadChapter(item.id)
      if (!chapter) continue
      const text = htmlToText(chapter.html)
      // 纯封面/图片等无文本章节跳过, 避免死页
      if (text.length === 0) continue
      const index = chapters.length
      chapters.push({
        id: item.id,
        index,
        title: titleById.get(item.id) ?? this.fallbackTitle(item.href, index),
        text
      })
    }
    // 本地章节可能因跳过 linear=no/空正文而与 legado 章节表错位, 经 adapter 换算每章 legadoIndex
    const legadoMap = buildEpubLegadoMap(epub)
    for (const chapter of chapters) {
      chapter.legadoIndex = legadoMap.toLegadoById(chapter.id)
    }
    return new EpubBook({
      filePath: this.filePath,
      name: metadata?.title || path.basename(this.filePath, path.extname(this.filePath)),
      author: metadata?.creator?.[0]?.contributor ?? '',
      chapters
    })
  }

  private fallbackTitle(href: string, index: number): string {
    const name = path.basename(href, path.extname(href))
    return name ? name : `第 ${index + 1} 章`
  }
}
