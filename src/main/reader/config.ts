import path from 'path'
import { dataDir } from '../util'
import type { ChapterRegex, Config as SharedConfig, TxtConfig } from '../../shared/reader'

export type {
  ChapterRegex,
  ConfigPatch,
  StatusConfig,
  StatusCorner,
  StatusStyle,
  TxtConfig
} from '../../shared/reader'

// 主进程侧沿用 Config 同名承载类型与默认值, 调用方按值/类型使用都无需改 import
export type Config = SharedConfig

type StoredTxtConfig = { chapterRegex?: (string | ChapterRegex)[] }

// 旧版配置只保存正则字符串, 启动时补上启用状态
export function normalizeTxtConfig(stored: StoredTxtConfig | undefined): TxtConfig {
  return {
    chapterRegex: (stored?.chapterRegex ?? []).map((item) =>
      typeof item === 'string' ? { pattern: item, enabled: true } : item
    )
  }
}

export const Config: { Default: Config } = {
  Default: {
    file: path.join(dataDir, 'notFound.txt'),
    position: { chapterIndex: 0, chapterPos: 0 },
    maxLine: 1,
    chunkSize: 40,
    txt: {
      // 匹配 "第 x 章 title" 形式的章节标题行, 兼容无空格写法
      chapterRegex: [{ pattern: '^\\s*第\\s*\\d+\\s*章', enabled: true }]
    },
    sync: { mode: 'approximate' },
    status: {
      enabled: true,
      // 默认右下角: 默认 1 行文本时与正文错开
      corner: 'bottom-right',
      // 默认独立样式, 与正文区分更清楚
      style: 'badge',
      // 预设常用格式, 均可在设置中编辑; formatIndex 默认启用第一项
      formats: [
        '{chapter} · {page}/{total} · {percent}%',
        '{chapter} · {page}/{total}',
        '{chapter} · {percent}%',
        '{page}/{total} · {percent}%',
        '{chapter}',
        '{page}/{total}',
        '{percent}%'
      ],
      formatIndex: 0
    },
    style: { active: 'default', customs: [] },
    recent: []
  }
}
