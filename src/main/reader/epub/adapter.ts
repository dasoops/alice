import type { EpubFile, NavPoint } from '@lingo-reader/epub-parser'

// 本地阅读章节与 legado 章节 index 的对齐适配;
// 复刻 legado EpubFile.getChapterList 的章节表构建, 保证同一阅读位置在两端对应同一durChapterIndex

export type EpubLegadoMap = {
  // 推送: 本地章节(manifest id) -> legado 章节 index; 本地章在 legado 表无对应时返回 undefined
  toLegadoById(id: string): number | undefined
}

// legado 章节表内部条目; priority 用于同一资源被卷首页与目录条目重复引用时选优
type LegadoEntry = {
  index: number
  // 资源对应的 manifest id, 卷容器(无资源)节点为空
  id?: string
  // 目录条目(2) 优先于卷首页(1), 二者指向同一资源时保留目录条目
  priority: number
}

const spinePriority = 1
const menuPriority = 2

// 复刻 legado EpubFile.getChapterList(有目录) 的章节表:
// 卷首页(parseFirstPage) + 目录树(parseMenu, 含无资源的卷容器节点), 最后统一重排 index
export function buildEpubLegadoMap(epub: EpubFile): EpubLegadoMap {
  const manifest = epub.getManifest()
  const idByHerf = new Map<string, string>()
  for (const [id, item] of Object.entries(manifest)) {
    idByHerf.set(item.href, id)
  }

  const entries = buildLegadoTable(epub, idByHerf)

  const forward = new Map<string, number>()
  const priorityById = new Map<string, number>()
  for (const entry of entries) {
    if (!entry.id) continue
    if (entry.priority > (priorityById.get(entry.id) ?? 0)) {
      priorityById.set(entry.id, entry.priority)
      forward.set(entry.id, entry.index)
    }
  }

  return {
    toLegadoById: (id) => forward.get(id)
  }
}

function buildLegadoTable(epub: EpubFile, idByHref: Map<string, string>): LegadoEntry[] {
  const toc = epub.getToc()
  if (toc.length === 0) {
    // 无目录: 按 spine 全量顺序建章, 含 linear=no 与空正文页, 与 legado 无目录回退一致
    return epub.getSpine().map((item, index) => ({ index, id: item.id, priority: spinePriority }))
  }

  const entries: LegadoEntry[] = []
  // 卷首页: 第一个含资源的顶层目录条目之前的 htm 资源, 一个资源一章
  const firstRef = findFirstResourceRef(epub, toc)
  if (firstRef) {
    for (const { id, base } of contentsOf(epub, idByHref)) {
      if (!isHtm(epub.getManifest()[id])) continue
      if (base === firstRef.base) break
      entries.push({ index: entries.length, id, priority: spinePriority })
    }
  }
  // 目录树: 递归展开每个目录条目; 无资源节点(卷容器)占 index, url 为 epub-toc://
  appendMenu(entries, toc, epub)
  // legado 在构建完成后统一按列表顺序重排 index
  entries.forEach((entry, index) => {
    entry.index = index
  })
  return entries
}

// 复刻 epublib EpubBook.getContents 的顺序: 封面页 -> spine -> 目录唯一资源 -> guide, 按 href 去重
function contentsOf(epub: EpubFile, baseToId: Map<string, string>): { id: string; base: string }[] {
  const order: { id: string; base: string }[] = []
  const seen = new Set<string>()
  const push = (id: string, base: string): void => {
    if (seen.has(base)) return
    seen.add(base)
    order.push({ id, base })
  }

  // 封面页: guide 的 cover 引用资源, 缺省退 spine[0]
  const guide = epub.getGuide()
  const coverRef = guide.find((ref) => ref.type === 'cover')
  const cover = coverRef && epub.resolveHref(coverRef.href)
  if (cover) {
    const base = baseHrefOf(coverRef.href)
    if (baseToId.has(base)) push(cover.id, base)
  } else {
    const first = epub.getSpine()[0]
    if (first) push(first.id, baseHrefOf(first.href))
  }

  for (const item of epub.getSpine()) push(item.id, baseHrefOf(item.href))
  for (const base of tocUniqueBases(epub.getToc())) {
    const id = baseToId.get(base)
    if (id) push(id, base)
  }
  for (const ref of guide) {
    const resolved = epub.resolveHref(ref.href)
    const base = baseHrefOf(ref.href)
    if (resolved && baseToId.has(base)) push(resolved.id, base)
  }
  return order
}

// 递归收集目录中可解析资源的基础 href(无资源节点即目录容器, 不入列)
function tocUniqueBases(toc: NavPoint[]): string[] {
  const bases: string[] = []
  const seen = new Set<string>()
  const visit = (items: NavPoint[]): void => {
    for (const item of items) {
      const base = baseHrefOf(item.href)
      if (base && !seen.has(base)) {
        seen.add(base)
        bases.push(base)
      }
      if (item.children) visit(item.children)
    }
  }
  visit(toc)
  return bases
}

// 第一个含可解析资源的顶层目录条目; 无资源时 legado 跳过卷首页解析
function findFirstResourceRef(
  epub: EpubFile,
  toc: NavPoint[]
): { id: string; base: string } | undefined {
  for (const item of toc) {
    const resolved = epub.resolveHref(item.href)
    if (resolved) return { id: resolved.id, base: baseHrefOf(item.href) }
  }
  return undefined
}

// 递归展开目录树为章节, 每项一章(含卷容器), 子项紧随父项
function appendMenu(entries: LegadoEntry[], toc: NavPoint[], epub: EpubFile): void {
  for (const item of toc) {
    const resolved = epub.resolveHref(item.href)
    entries.push({ index: entries.length, id: resolved?.id, priority: menuPriority })
    if (item.children) appendMenu(entries, item.children, epub)
  }
}

// epub: 前缀去掉后即为 manifest 的绝对 href; 目录/guide href 可能带 #fragment
function baseHrefOf(href: string): string {
  const raw = href.startsWith('epub:') ? href.slice(5) : href
  return raw.split('#')[0]
}

function isHtm(item: { mediaType: string } | undefined): boolean {
  return item?.mediaType.includes('htm') ?? false
}
