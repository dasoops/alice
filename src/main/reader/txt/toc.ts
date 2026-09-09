import { lineSeparator } from '../../constants'
import type { Chapter } from '../chapter'

export function compileChapterRegexes(
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

export function buildToc(regexes: RegExp[], content: string): Chapter[] {
  if (regexes.length === 0) return []

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

  const chapters: Chapter[] = []
  // 首个标题行之前的非空内容作为第 0 章
  if (content.substring(0, entries[0].beginChar).trim().length > 0) {
    chapters.push({ index: 0, title: '前言', beginChar: 0, endChar: entries[0].beginChar })
  }
  for (let i = 0; i < entries.length; i++) {
    chapters.push({
      index: chapters.length,
      title: entries[i].title,
      beginChar: entries[i].beginChar,
      endChar: i + 1 < entries.length ? entries[i + 1].beginChar : content.length
    })
  }
  return chapters
}
