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

export const statusCornerOptions: {
  value: ReaderSettings['status']['corner']
  label: string
}[] = [
  { value: 'top-left', label: '左上' },
  { value: 'top-right', label: '右上' },
  { value: 'bottom-left', label: '左下' },
  { value: 'bottom-right', label: '右下' }
]

export const statusStyleOptions: {
  value: ReaderSettings['status']['style']
  label: string
}[] = [
  { value: 'plain', label: '跟随正文' },
  { value: 'badge', label: 'badge' }
]

// 编辑态实时校验: 非法值标红并在状态栏提示修改, 保存前拦截;
// 校验保证值合法后, 提交前仅做 trim 清洗, 不再静默回退
export type SettingsErrors = {
  file?: string
  regex: (string | undefined)[]
  styleNames: (string | undefined)[]
  statusFormats?: string
  url?: string
  directory?: string
}

export async function validateSettings(draft: SettingsData): Promise<SettingsErrors> {
  const required = (value: string): string | undefined => (value.trim() ? undefined : '不能为空')
  const { formats, formatIndex } = draft.reader.status
  const activeFormat = formats[formatIndex]
  // 名称输入框只渲染当前样式, 非当前项无法编辑, 不参与校验以免永久阻塞保存
  const activeStyleIndex = draft.reader.style.customs.findIndex(
    (item) => item.id === draft.reader.style.active
  )
  const errors: SettingsErrors = {
    file: required(draft.reader.file.trim()),
    regex: draft.reader.txt.chapterRegex.map((item) => {
      // 关闭的规则不参与匹配, 非法内容不应阻塞保存
      if (!item.enabled) return undefined
      const pattern = item.pattern.trim()
      if (!pattern) return '不能为空'
      try {
        new RegExp(pattern)
      } catch {
        return '正则不合法'
      }
      return undefined
    }),
    styleNames: draft.reader.style.customs.map((item, index) =>
      index === activeStyleIndex && !item.name.trim() ? '不能为空' : undefined
    ),
    statusFormats: !draft.reader.status.enabled
      ? undefined
      : formatIndex < 0 || formatIndex >= formats.length
        ? '请选择一个启用格式'
        : !activeFormat?.trim()
          ? '启用格式不能为空'
          : undefined,
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
  push(errors.statusFormats, '阅读进度: 格式')
  push(errors.url, 'WebDav 同步: 地址')
  push(errors.directory, 'WebDav 同步: 目录')
  errors.regex.forEach((message, index) => {
    if (message) list.push(`阅读: 章节正则 #${index + 1}: ${message}`)
  })
  errors.styleNames.forEach((message, index) => {
    if (message) list.push(`阅读: 正文样式 #${index + 1}: 名称${message}`)
  })
  return list
}

export function firstErrorKey(errors: SettingsErrors): string {
  if (errors.file) return 'file'
  const regexIndex = errors.regex.findIndex((message) => message !== undefined)
  if (regexIndex >= 0) return `regex:${regexIndex}`
  const styleIndex = errors.styleNames.findIndex((message) => message !== undefined)
  if (styleIndex >= 0) return `styleName:${styleIndex}`
  if (errors.statusFormats) return 'statusFormats'
  if (errors.url) return 'url'
  return 'directory'
}
