import type { EpubToc, NavPoint } from '@lingo-reader/epub-parser'

// 展平目录树为 manifest id -> 标题, 同 id 取首次出现(顶层优先)
export function flattenToc(toc: EpubToc): Map<string, string> {
  const titles = new Map<string, string>()
  const visit = (items: NavPoint[]): void => {
    for (const item of items) {
      if (item.id && !titles.has(item.id)) titles.set(item.id, item.label)
      if (item.children) visit(item.children)
    }
  }
  visit(toc)
  return titles
}
