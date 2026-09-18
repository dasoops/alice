import path from 'path'
import { dataDir } from '../util'
import type { Position } from './book'
import type { SyncMode } from './sync/progress'

export type TxtConfig = { chapterRegex: string[] }

export type Config = {
  file: string
  position: Position
  chunkSize: number
  maxLine: number
  txt: TxtConfig
  sync: { mode: SyncMode }
  // 最近打开的文件绝对路径, 按时间倒序, 运行时状态不进入设置契约
  recent: string[]
}

export const Config: { Default: Config } = {
  Default: {
    file: path.join(dataDir, 'notFound.txt'),
    position: { chapterIndex: 0, chapterPos: 0 },
    maxLine: 1,
    chunkSize: 40,
    txt: {
      // 匹配 "第 x 章 title" 形式的章节标题行, 兼容无空格写法
      chapterRegex: ['^\\s*第\\s*\\d+\\s*章']
    },
    sync: { mode: 'approximate' },
    recent: []
  }
}
