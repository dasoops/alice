import path from 'path'
import { dataDir } from '../util'

export type Config = {
  file: string
  index: number
  chunkSize: number
  maxLine: number
  txtChapterRegex: string[]
}

export const Config: { Default: Config } = {
  Default: {
    file: path.join(dataDir, 'read.txt'),
    index: 0,
    maxLine: 1,
    chunkSize: 40,
    // 匹配 "第 x 章 title" 形式的章节标题行, 兼容无空格写法
    txtChapterRegex: ['^\\s*第\\s*\\d+\\s*章']
  }
}
