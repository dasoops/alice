import type { NavPoint } from '@lingo-reader/epub-parser'
import type { Chapter, Volume } from '../book'

// 顶层带子节点的条目视为卷, 边界取其首个可定位章节; 平铺目录不分组
export function buildVolumes(
  chapters: Chapter[],
  toc: NavPoint[],
  indexById: Map<string, number>
): Volume[] {
  const anchors: { index: number; title: string }[] = []
  for (const node of toc) {
    if (!node.children?.length) continue
    const index = firstIndex(node, indexById)
    const title = node.label.trim()
    if (index === undefined || title === '') continue
    anchors.push({ index, title })
  }

  const valid = anchors
    .filter((anchor) => anchor.index >= 0 && anchor.index < chapters.length)
    .sort((a, b) => a.index - b.index)
    .filter((anchor, i, list) => i === 0 || anchor.index !== list[i - 1].index)

  if (valid.length === 0) {
    return chapters.length > 0 ? [{ head: chapters[0].index, start: 0, end: chapters.length }] : []
  }

  const volumes: Volume[] = []
  // 首个锚点之前的内容(前言/封面等)构成无标题的前置组
  if (valid[0].index > 0) {
    volumes.push({ head: chapters[0].index, start: 0, end: valid[0].index })
  }
  for (let i = 0; i < valid.length; i++) {
    const start = valid[i].index
    const end = i + 1 < valid.length ? valid[i + 1].index : chapters.length
    volumes.push({
      title: valid[i].title,
      head: start,
      start,
      end
    })
  }
  return volumes
}

// 卷容器自身可能无资源(id 为空), 此时取后代中最小章节位置
function firstIndex(node: NavPoint, indexById: Map<string, number>): number | undefined {
  let min: number | undefined
  for (const child of node.children ?? []) {
    const found = firstIndex(child, indexById)
    if (found !== undefined && (min === undefined || found < min)) min = found
  }
  const own = node.id ? indexById.get(node.id) : undefined
  if (own === undefined) return min
  return min === undefined ? own : Math.min(own, min)
}
