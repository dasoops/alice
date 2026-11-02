import type { PopupChapter, PopupChapterGroup } from './types'

// 卷首章节识别: "第1卷 1~50" / "第一卷 xxx" / "卷3 xxx" / "Volume 1" / "VOL.2"
// 只按标题判断, 本项目没有独立卷结构; "第1章" 之类不匹配
const VOLUME_TITLE_RE =
  /^\s*(?:第\s*[0-9〇零一二三四五六七八九十百千万两]+\s*卷|卷\s*[0-9〇零一二三四五六七八九十百千万两]+|(?:vol\.?|volume)\s*\d+)/i

// 卷首章节 + 至少 2 个正文章节才折叠; 单章/无章卷保持平铺
const MIN_COLLAPSIBLE_SIZE = 3

function isVolumeTitle(title: string): boolean {
  return VOLUME_TITLE_RE.test(title)
}

// 按卷首章节把平铺目录切成组; 无卷标题时返回单个无标题组(等价平铺)
export function buildChapterGroups(chapters: PopupChapter[]): PopupChapterGroup[] {
  const groups: PopupChapterGroup[] = []

  for (const chapter of chapters) {
    if (isVolumeTitle(chapter.title)) {
      groups.push({
        title: chapter.title,
        head: chapter.index,
        chapters: [chapter],
        collapsible: false
      })
      continue
    }

    // 首个卷之前的章节(前言等)归入无标题组, 与后续卷组并列
    let group = groups[groups.length - 1]
    if (!group) {
      group = { chapters: [], collapsible: false }
      groups.push(group)
    }
    group.chapters.push(chapter)
  }

  return groups.map((group) => ({
    ...group,
    collapsible: group.title !== undefined && group.chapters.length >= MIN_COLLAPSIBLE_SIZE
  }))
}
