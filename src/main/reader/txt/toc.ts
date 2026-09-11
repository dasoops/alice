import { lineSeparator } from '../../constants'
import type { Chapter } from '../book'
import log from 'electron-log/main'

// 含全文字符偏移的章节; extends 共享 Chapter, 运行时经 Book.chapters 对外可见
export type TxtChapter = Chapter & {
  beginChar: number
  endChar: number
}

export function compileRegexes(
  patterns: string[],
  onInvalid?: (pattern: string) => void
): RegExp[] {
  const regexes: RegExp[] = []
  for (const pattern of patterns) {
    try {
      regexes.push(new RegExp(pattern))
    } catch {
      onInvalid?.(pattern)
    }
  }
  return regexes
}

export function buildToc(regexes: RegExp[], content: string): TxtChapter[] {
  if (regexes.length === 0) {
    log.warn('TxtParser ==> 章节正则列表为空, 全书作为单章')
    return [wholeBookChapter(content)]
  }

  log.debug('TxtParser ==> 章节正则列表: %s, 开始解析', regexes.join('\n'))
  // 缓存内容行以 lineSeparator 连接, 逐行累计字符偏移
  const entries: { title: string; beginChar: number }[] = []
  let offset = 0
  for (const line of content.split(lineSeparator)) {
    if (line.length > 0 && regexes.some((regex) => regex.test(line))) {
      entries.push({ title: line, beginChar: offset })
    }
    offset += line.length + 1
  }
  if (entries.length === 0) {
    log.warn('TxtParser ==> 未匹配到章节标题, 全书作为单章')
    return [wholeBookChapter(content)]
  }

  const chapters: TxtChapter[] = []
  // 首个标题行之前的内容作为 第 0 章 前言, 空白(空行)也占位, 保证任意定位都落入章节;
  // legado 仅在首章前非空白时生成前言(TextFile isNotBlank), 空白前言章在 legado 无对应
  let blankPreface = false
  if (entries[0].beginChar > 0) {
    blankPreface = content.substring(0, entries[0].beginChar).trim().length === 0
    chapters.push({
      index: 0,
      title: '前言',
      beginChar: 0,
      endChar: entries[0].beginChar,
      legadoIndex: blankPreface ? undefined : 0
    })
  }
  for (let i = 0; i < entries.length; i++) {
    const index = chapters.length
    chapters.push({
      index,
      title: entries[i].title,
      beginChar: entries[i].beginChar,
      endChar: i + 1 < entries.length ? entries[i + 1].beginChar : content.length,
      // 空白前言占位章使本地正文章节相对 legado 后移 1, 其余情况(无前言/非空白前言)恒等
      legadoIndex: index - (blankPreface ? 1 : 0)
    })
  }
  return chapters
}

// 无正则/无匹配时全书作为固定单章, 保证始终有可读章节;
// 与 legado 无规则按字节切"第N章"不同, 此处只要求章节可读, 不做字节切分
function wholeBookChapter(content: string): TxtChapter {
  return { index: 0, title: '正文', beginChar: 0, endChar: content.length, legadoIndex: 0 }
}

// 最近包含 index 的章节; 区间为 [beginChar, endChar), index 在首章前或 toc 为空时为 undefined
// current 为调用方已知的当前章, 命中时跳过遍历
export function findChapterAt(
  chapters: TxtChapter[],
  index: number,
  current?: TxtChapter
): TxtChapter | undefined {
  if (current && index >= current.beginChar && index < current.endChar) return current
  let chapter: TxtChapter | undefined
  for (const it of chapters) {
    if (index < it.beginChar) break
    chapter = it
  }
  return chapter
}
