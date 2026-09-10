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
