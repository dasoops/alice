import type { Config as ReaderConfig } from '../reader'
import type { Config as WebDavConfig } from '../webdav'
import type { Config as ShortcutConfig } from '../shortcut'

export type PopupMode = 'message' | 'prompt' | 'settings' | 'chapter'

export type MessageType = 'info' | 'error' | 'warning' | 'question'

export type PopupMessageOptions = {
  type?: MessageType
  title?: string
  message: string
  detail?: string
  buttons?: string[]
  // 默认聚焦/回车触发的按钮下标, 缺省为 0
  defaultId?: number
  // Esc/关闭窗口时返回的按钮下标, 缺省为末位按钮
  cancelId?: number
}

// 参考 p-sam/electron-prompt 设计
export type PopupPromptOptions = {
  title?: string
  label?: string
  value?: string
  inputAttrs?: {
    type?: 'text' | 'number'
    min?: number
    max?: number
    step?: number
    maxLength?: number
    placeholder?: string
  }
  buttonLabels?: {
    ok?: string
    cancel?: string
  }
}

export type PopupSettingsOptions = object

// 章节选择面板数据; index 为 toc 序号(含前言为 0), 与本地章节表 / legado 对齐
export type PopupChapter = {
  index: number
  title: string
}

export type PopupChapterOptions = {
  bookName?: string
  chapters: PopupChapter[]
  current: number
}

// 章节选择按卷分组: title/head 只有可识别的卷首章节组才有;
// chapters 含卷首章节本身, collapsible 由主进程按组内章节数判定
export type PopupChapterGroup = {
  title?: string
  head?: number
  chapters: PopupChapter[]
  collapsible: boolean
}

// 与 ReaderConfig 同构(剔除运行状态 position 与 recent)
export type ReaderSettings = Omit<ReaderConfig, 'position' | 'recent'>

export type WebDavSettings = WebDavConfig

export type ShortcutSettings = ShortcutConfig

export type SettingsData = {
  reader: ReaderSettings
  webdav: WebDavSettings
  shortcut: ShortcutSettings
}

export type PopupInit =
  | { mode: 'message'; options: PopupMessageOptions }
  | { mode: 'prompt'; options: PopupPromptOptions }
  | { mode: 'settings'; options: PopupSettingsOptions; data: SettingsData }
  | { mode: 'chapter'; options: PopupChapterOptions; groups: PopupChapterGroup[] }
