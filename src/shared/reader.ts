import type { ReaderStyle } from './readerStyle'

// 跨格式统一阅读定位, 与 legado BookProgress(durChapterIndex/durChapterPos) 同构;
// 全局字符 index 等格式内部实现细节不进入共享抽象
export type Position = {
  chapterIndex: number
  chapterPos: number
}

// approximate: 同步章内近似位置; chapter: 只同步章节信息(仅章节号, 章内位置恒为 0)
export type SyncMode = 'approximate' | 'chapter'

// 阅读角标所需的进度: percent 为全书已读字符占比 [0, 1];
// page/pageTotal 在展示格式不需要页码时省略, 避免大文本做无用的整章分页
export type ReadingProgress = {
  chapterTitle: string
  page?: number
  pageTotal?: number
  percent: number
}

export type ChapterRegex = {
  pattern: string
  // 关闭的规则保留但不参与匹配, 便于按书籍切换而无需反复增删
  enabled: boolean
}

export type TxtConfig = { chapterRegex: ChapterRegex[] }

export type StatusCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// plain: 同正文样式(字号小 2px, 无背景); badge: 独立样式(带背景角标)
export type StatusStyle = 'plain' | 'badge'

export type StatusConfig = {
  enabled: boolean
  corner: StatusCorner
  style: StatusStyle
  // 可选格式列表, formatIndex 指向当前启用项
  formats: string[]
  formatIndex: number
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
  // 正文样式: 内置预设或自定义 CSS, 由主窗口注入 #content / #status.is-plain
  style: ReaderStyle
  // 最近打开的文件绝对路径, 按时间倒序, 运行时状态不进入设置契约
  recent: string[]
}

// 设置面板可编辑的部分; position/recent 为运行状态, 由 Reader 自行维护
export type ConfigPatch = Omit<Config, 'position' | 'recent'>

// 阅读角标数据; 开关关闭时不计算进度, 仅回传配置
export type ReaderStatus = {
  config: StatusConfig
  progress?: ReadingProgress
}

// 翻页结果携带同一页算出的进度, 避免渲染层再请求一次 reader:status
export type ReadResult = {
  content: string
  status: ReaderStatus
}
