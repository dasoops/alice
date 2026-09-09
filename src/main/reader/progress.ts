// https://github.com/HapeLee/legado-with-MD3/blob/1d69ec70d246b93867cba32db93ec5110511612e/app/src/main/java/io/legado/app/help/AppWebDav.kt
// 根据 legado-with-MD3 AppWebDav 实现复刻, 保证 算法 / 结构 与其相同

// 书名/作者共同决定远端进度文件名 (name_author.json)
export type BookMeta = {
  name: string
  author: string
}

// legado bookProgress json, 全字段必填; 在 BookMeta 基础上扩展阅读进度
export type BookProgress = BookMeta & {
  durChapterIndex: number
  durChapterPos: number
  durChapterTime: number
  durChapterTitle: string
}

// 合并规则: 按 (durChapterIndex, durChapterPos) 字典序比较, 与时间戳无关
export function compareProgress(a: BookProgress, b: BookProgress): number {
  if (a.durChapterIndex !== b.durChapterIndex) return a.durChapterIndex - b.durChapterIndex
  return a.durChapterPos - b.durChapterPos
}

export function normalizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_')
}

// 顺序敏感: % 必须最先替换, 否则会产生二次编码
const reservedCharMap: [string, string][] = [
  ['%', '%25'],
  [' ', '%20'],
  ['"', '%22'],
  ['#', '%23'],
  ['&', '%26'],
  ['(', '%28'],
  [')', '%29'],
  ['+', '%2B'],
  [',', '%2C'],
  ['/', '%2F'],
  [':', '%3A'],
  [';', '%3B'],
  ['<', '%3C'],
  ['=', '%3D'],
  ['>', '%3E'],
  ['?', '%3F'],
  ['@', '%40'],
  ['\\', '%5C'],
  ['|', '%7C']
]

export function replaceReservedChar(value: string): string {
  let result = value
  for (const [char, encoded] of reservedCharMap) {
    result = result.split(char).join(encoded)
  }
  return result
}

export function bookProgressFileName(name: string, author: string): string {
  return replaceReservedChar(normalizeFileName(`${name}_${author}`)) + '.json'
}
