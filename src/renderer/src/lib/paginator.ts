// 正文渲染与分页共用同一变换, 保证测量高度就是实际展示高度
export function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('<br />')
}

// scrollHeight 在内容不足时等于 clientHeight, 因此 <= 即视为未溢出
function fits(container: HTMLElement, text: string, start: number, end: number): boolean {
  container.innerHTML = textToHtml(text.substring(start, end))
  return container.scrollHeight <= container.clientHeight + 1
}

// 相邻页的字数接近, 以上一页长度为初值可少几轮倍增探测
const initialPageSeed = 512

// 从 start 起倍增探测放不下的上界, 再二分找当前页能容纳的最大字符数.
// low/high 是相对 start 的页长, 传给 fitsAt 前必须换算成绝对偏移, 否则第二页起
// 会测量成 [start, start+length] 之外的切片
export function findPageEnd(
  text: string,
  start: number,
  fitsAt: (end: number) => boolean,
  seed = initialPageSeed
): number {
  const remaining = text.length - start
  if (remaining <= 0) return start

  let low = 0
  let high = Math.min(remaining, Math.max(1, seed))
  while (fitsAt(start + high)) {
    low = high
    if (high >= remaining) return text.length
    high = Math.min(remaining, high * 2)
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (fitsAt(start + mid)) low = mid
    else high = mid
  }
  // 极端情况下单个字符也放不下, 仍返回 1 字符的页, 避免死循环
  return start + (low > 0 ? low : 1)
}

// 从 end 向前倍增探测上界, 再二分找上一页的最早起点; 语义与 findPageEnd 对称
export function findPageStart(
  end: number,
  fitsAt: (start: number) => boolean,
  seed = initialPageSeed
): number {
  if (end <= 0) return 0

  let low = 0
  let high = Math.min(end, Math.max(1, seed))
  while (fitsAt(end - high)) {
    low = high
    if (high >= end) return 0
    high = Math.min(end, high * 2)
  }

  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (fitsAt(end - mid)) low = mid
    else high = mid
  }
  // 一字符也放不下时仍占一页, 避免死循环
  return end - (low > 0 ? low : 1)
}

export type PageSlice = {
  starts: number[]
  currentIndex: number
}

// 以 anchor 为当前页起点, 向前/向后分别补齐页边界; 保证 anchor 始终是页首
export function pageStartsAround(
  text: string,
  anchor: number,
  fitsAt: (start: number, end: number) => boolean
): PageSlice {
  const before: number[] = []
  let start = anchor
  let seed = initialPageSeed
  while (start > 0) {
    const previous = findPageStart(start, (candidate) => fitsAt(candidate, start), seed)
    if (previous >= start) break
    before.unshift(previous)
    seed = start - previous
    start = previous
  }

  const after: number[] = []
  let end = anchor
  seed = initialPageSeed
  while (end < text.length) {
    const next = findPageEnd(text, end, (candidate) => fitsAt(end, candidate), seed)
    if (next <= end) break
    seed = next - end
    end = next
    if (end < text.length) after.push(end)
  }

  return { starts: [...before, anchor, ...after], currentIndex: before.length }
}

export type MeasureOptions = {
  // 测量会替换容器内容; 调用方会立即渲染最终内容时可跳过恢复
  restore?: boolean
}

function withMeasurement<T>(container: HTMLElement, task: () => T, restore: boolean): T {
  const previous = container.innerHTML
  try {
    return task()
  } finally {
    if (restore) container.innerHTML = previous
  }
}

// 从章首开始分页; 用于进入上一章末页等需要固定页网格的场景
export function paginate(
  container: HTMLElement,
  text: string,
  { restore = true }: MeasureOptions = {}
): number[] {
  const starts = [0]
  if (text.length === 0 || container.clientHeight <= 0) return starts

  return withMeasurement(
    container,
    () => {
      let start = 0
      let seed = initialPageSeed
      while (start < text.length) {
        const end = findPageEnd(
          text,
          start,
          (candidate) => fits(container, text, start, candidate),
          seed
        )
        if (end <= start) break
        seed = end - start
        start = end
        if (start < text.length) starts.push(start)
      }
      return starts
    },
    restore
  )
}

// 以 anchor 为页首分页; 重排时保证首字不变
export function paginateAround(
  container: HTMLElement,
  text: string,
  anchor: number,
  { restore = true }: MeasureOptions = {}
): PageSlice {
  if (text.length === 0 || container.clientHeight <= 0) return { starts: [0], currentIndex: 0 }
  const position = Math.min(Math.max(anchor, 0), text.length - 1)
  return withMeasurement(
    container,
    () => pageStartsAround(text, position, (start, end) => fits(container, text, start, end)),
    restore
  )
}
