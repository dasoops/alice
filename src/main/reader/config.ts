import path from 'path'
import { dataDir } from '../util'
import type { Position } from './book'
import type { SyncMode } from './sync/progress'

export type TxtConfig = { chapterRegex: string[] }

export type StatusCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// plain: 同正文样式(字号小 2px, 无背景); badge: 独立样式(带背景角标)
export type StatusStyle = 'plain' | 'badge'

// 可编辑的展示格式; 同一时间最多一项 enabled
export type StatusFormat = {
  template: string
  enabled: boolean
}

export type StatusConfig = {
  enabled: boolean
  corner: StatusCorner
  style: StatusStyle
  formats: StatusFormat[]
}

export type Config = {
  file: string
  position: Position
  // 单页字符上限, 与 maxLine 先到为准; 防止超长段落撑爆窗口, 调小会掩盖 maxLine 的效果
  chunkSize: number
  maxLine: number
  txt: TxtConfig
  sync: { mode: SyncMode }
  // 阅读角标: 章节标题 / 本章页码 / 全书百分比
  status: StatusConfig
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
    status: {
      enabled: true,
      // 默认右下角: 默认 1 行文本时与正文错开
      corner: 'bottom-right',
      // 默认独立样式, 与正文区分更清楚
      style: 'badge',
      // 预设常用格式, 均可在设置中编辑; 第一项默认启用
      formats: [
        { template: '{chapter} · {page}/{total} · {percent}%', enabled: true },
        { template: '{chapter} · {page}/{total}', enabled: false }
      ]
    },
    recent: []
  }
}
