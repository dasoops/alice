export type Chapter = {
  index: number
  title: string
  beginChar: number
  endChar: number
}

// 最近包含 index 的章节; 区间为 [beginChar, endChar), index 在首章前或 toc 为空时为 undefined
export function findChapterAt(chapters: Chapter[], index: number): Chapter | undefined {
  let chapter: Chapter | undefined
  for (const it of chapters) {
    if (index < it.beginChar) break
    chapter = it
  }
  return chapter
}
