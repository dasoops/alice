import type { ReaderSettings, SettingsData, ShortcutSettings } from '../../../../main/popup/types'

export const shortcutKeys: { key: keyof ShortcutSettings; label: string }[] = [
  { key: 'toggleDisplay', label: '显示 / 隐藏' },
  { key: 'toggleLock', label: '锁定' },
  { key: 'prevPage', label: '上一页' },
  { key: 'nextPage', label: '下一页' },
  { key: 'exit', label: '退出' }
]

export const syncOptions: { value: ReaderSettings['sync']['mode']; label: string }[] = [
  { value: 'approximate', label: '同步具体位置(跨应用时会存在误差)' },
  { value: 'chapter', label: '仅同步章节' }
]

// 编辑态实时校验: 非法值标红并在状态栏提示修改, 保存前拦截;
// 校验保证值合法后, 提交前仅做 trim 清洗, 不再静默回退
export type SettingsErrors = {
  file?: string
  chunkSize?: string
  maxLine?: string
  regex: (string | undefined)[]
  url?: string
  directory?: string
}

export async function validateSettings(draft: SettingsData): Promise<SettingsErrors> {
  const positiveInt = (value: number): string | undefined =>
    value >= 1 && Number.isInteger(value) ? undefined : '需为大于 0 的整数'
  const required = (value: string): string | undefined => (value.trim() ? undefined : '不能为空')
  const errors: SettingsErrors = {
    file: required(draft.reader.file.trim()),
    chunkSize: positiveInt(draft.reader.chunkSize),
    maxLine: positiveInt(draft.reader.maxLine),
    regex: draft.reader.txt.chapterRegex.map((item) => {
      const pattern = item.trim()
      if (!pattern) return '不能为空'
      try {
        new RegExp(pattern)
      } catch {
        return '正则不合法'
      }
      return undefined
    }),
    // WebDav 未启用时地址/目录可留空, 启用后必须配置
    url: draft.webdav.enabled ? required(draft.webdav.url) : undefined,
    directory: draft.webdav.enabled ? required(draft.webdav.directory) : undefined
  }
  if (!errors.file) {
    const exists = await window.popup.validateFile(draft.reader.file.trim())
    if (!exists) errors.file = '文件不存在'
  }
  return errors
}

export function errorList(errors: SettingsErrors): string[] {
  const list: string[] = []
  const push = (message: string | undefined, label: string): void => {
    if (message) list.push(`${label}: ${message}`)
  }
  push(errors.file, '阅读: 阅读文件')
  push(errors.chunkSize, '阅读: 每行字符数')
  push(errors.maxLine, '阅读: 每次展示行数')
  push(errors.url, 'WebDav 同步: 地址')
  push(errors.directory, 'WebDav 同步: 目录')
  errors.regex.forEach((message, index) => {
    if (message) list.push(`阅读: 章节正则 #${index + 1}: ${message}`)
  })
  return list
}

export function firstErrorKey(errors: SettingsErrors): string {
  if (errors.file) return 'file'
  if (errors.chunkSize) return 'chunkSize'
  if (errors.maxLine) return 'maxLine'
  const regexIndex = errors.regex.findIndex((message) => message !== undefined)
  if (regexIndex >= 0) return `regex:${regexIndex}`
  if (errors.url) return 'url'
  return 'directory'
}
