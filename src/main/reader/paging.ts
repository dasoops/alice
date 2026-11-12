import { lineSeparator } from '../constants'

// 从 index 出发沿 sign 方向推进, 移动 maxLine 行或 chunkSize 字符(先到为准)
export function nextPage(
  content: string,
  from: number,
  step: number,
  { maxLine, chunkSize }: { maxLine: number; chunkSize: number }
): number {
  const sign = step === 0 ? 1 : Math.sign(step)
  let pageIndex = from
  let line = 0
  while (true) {
    if (line >= maxLine) break
    if (Math.abs(pageIndex - from) >= chunkSize) break
    const target = pageIndex + sign
    if (target < 0 || target > content.length) break
    pageIndex = target
    if (content[pageIndex] === lineSeparator) line++
  }
  return pageIndex
}

export function pageRange(
  content: string,
  index: number,
  offset: number,
  options: { maxLine: number; chunkSize: number }
): { begin: number; end: number } {
  // 指针为当前页文本头部, 初始化当前页 起始/结束索引
  let begin: number, end: number
  // 下一页 当前页结束 后翻一页
  if (offset > 0) {
    begin = nextPage(content, index, offset, options)
    end = nextPage(content, begin, offset, options)
    // 已达尾页
    if (begin === content.length && end === content.length) {
      // 从尾开始读一页
      begin = nextPage(content, content.length, -1, options)
    }
  }
  // 上一页 当前页起始 前翻一页
  else if (offset < 0) {
    begin = nextPage(content, index, offset, options)
    end = index
    // 已达首页
    if (begin === 0 && end === 0) {
      // 从头开始读一页
      end = nextPage(content, 0, 1, options)
    }
  } else {
    begin = index
    end = nextPage(content, index, 0, options)
  }
  return { begin, end }
}

// 从 from 起按页切分到 end(不含), 返回各页起始偏移; 末页在 end 处截断
export function pageStarts(
  content: string,
  from: number,
  end: number,
  options: { maxLine: number; chunkSize: number }
): number[] {
  const starts: number[] = []
  let start = from
  while (start < end) {
    starts.push(start)
    const next = Math.min(nextPage(content, start, 0, options), end)
    // 分页参数非法(如 maxLine/chunkSize 为 0)时避免死循环
    if (next <= start) break
    start = next
  }
  // 空区间也占一页, 避免页码出现 0/0
  return starts.length > 0 ? starts : [from]
}

// 定位 index 所在页, 页码从 1 开始; index 落在末页之后时归入末页
export function pageInfo(starts: number[], index: number): { current: number; total: number } {
  const total = starts.length
  let page = 0
  let low = 0
  let high = total - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (starts[mid] <= index) {
      page = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return { current: page + 1, total }
}
