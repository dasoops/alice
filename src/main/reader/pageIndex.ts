import type { PageOptions } from './book'
import { pageInfo, pageStarts } from './paging'

type CacheEntry = { key: string; starts: number[] }

type PageIndexParams = {
  chapterIndex: number
  content: string
  from: number
  end: number
  options: PageOptions
}

// 章节分页索引: 缓存每章的页起点, 并把当前定位换算为章内页码
export class ChapterPageIndex {
  private readonly cache = new Map<number, CacheEntry>()

  // 获取章节页起点; 分页参数或章节文本区间变化时重建
  starts({ chapterIndex, content, from, end, options }: PageIndexParams): number[] {
    const key = `${options.maxLine}:${options.chunkSize}:${from}:${end}`
    const cached = this.cache.get(chapterIndex)
    const starts = cached?.key === key ? cached.starts : pageStarts(content, from, end, options)
    if (cached?.key !== key) this.cache.set(chapterIndex, { key, starts })
    return starts
  }

  info(params: PageIndexParams & { index: number }): { current: number; total: number } {
    return pageInfo(this.starts(params), params.index)
  }

  // 把任意位置吸附到包含它的页起点, 用于恢复进度时对齐页网格
  align(params: PageIndexParams & { index: number }): number {
    const starts = this.starts(params)
    let aligned = starts[0]
    for (const start of starts) {
      if (start > params.index) break
      aligned = start
    }
    return aligned
  }
}
