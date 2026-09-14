import type { Config as ReaderConfig } from '../reader'
import type { Config as WebDavConfig } from '../webdav'
import type { Config as ShortcutConfig } from '../shortcut'

export type PopupMode = 'message' | 'prompt' | 'settings'

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

// 与 ReaderConfig 同构(剔除运行状态 position)
export type ReaderSettings = Omit<ReaderConfig, 'position'>

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
