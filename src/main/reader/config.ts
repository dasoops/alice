import path from 'path'
import { dataDir } from '../util'
import type { Position } from './book'
import type { SyncMode } from './sync/progress'

export type Config = {
  file: string
  position: Position
  chunkSize: number
  maxLine: number
  txt: { chapterRegex: string[] }
  sync: { mode: SyncMode }
}

export const Config: { Default: Config } = {
  Default: {
    file: path.join(dataDir, 'read.txt'),
    position: { chapterIndex: 0, chapterPos: 0 },
    maxLine: 1,
    chunkSize: 40,
    txt: {
      // 匹配 "第 x 章 title" 形式的章节标题行, 兼容无空格写法
      chapterRegex: ['^\\s*第\\s*\\d+\\s*章']
    },
    sync: { mode: 'approximate' }
  }
}
