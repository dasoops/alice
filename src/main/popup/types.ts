import type { ConfigPatch } from '../reader'
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

// 章节选择按卷分组: 分组由 parser 层按目录结构给出;
// head 为卷首章节 index, 无 title 表示目录层级之前的前置组;
// 是否可折叠属于展示策略, 由渲染层按组内章节数判定
export type PopupChapterGroup = {
  title?: string
  head: number
  chapters: PopupChapter[]
}

// 设置面板的 reader 契约, 与本地配置的可编辑字段同构
export type ReaderSettings = ConfigPatch

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
