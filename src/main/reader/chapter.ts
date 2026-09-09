export type Chapter = {
  index: number
  title: string
  beginChar: number
  endChar: number
}

// 最近包含 index 的章节; 区间为 [beginChar, endChar), index 在首章前或 toc 为空时为 undefined
// current 为调用方已知的当前章, 命中时跳过遍历
export function findChapterAt(
  chapters: Chapter[],
  index: number,
  current?: Chapter
): Chapter | undefined {
  if (current && index >= current.beginChar && index < current.endChar) return current
  let chapter: Chapter | undefined
  for (const it of chapters) {
    if (index < it.beginChar) break
    chapter = it
  }
  return chapter
}
