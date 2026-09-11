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
    log.warn('TxtParser ==> 章节正则列表为空, 无法解析章节')
    return []
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
  if (entries.length === 0) return []

  const chapters: TxtChapter[] = []
  // TODO: legadoIndex 暂等于本地 index, 仅在两端章节表一致时成立;
  // legado 的正则来源/超长章节拆分/分卷/无规则回退均可能造成差异(见 TextFile.kt)
  // 首个标题行之前的非空内容作为第 0 章
  if (content.substring(0, entries[0].beginChar).trim().length > 0) {
    chapters.push({
      index: 0,
      title: '前言',
      beginChar: 0,
      endChar: entries[0].beginChar,
      legadoIndex: 0
    })
  }
  for (let i = 0; i < entries.length; i++) {
    const index = chapters.length
    chapters.push({
      index,
      title: entries[i].title,
      beginChar: entries[i].beginChar,
      endChar: i + 1 < entries.length ? entries[i + 1].beginChar : content.length,
      legadoIndex: index
    })
  }
  return chapters
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
