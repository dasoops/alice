import type { PopupMode } from '../../../../main/popup/types'

export type Layout = 'band' | 'panel'

// 覆写阅读条(随主窗口宽度)用 band, 锚定浮层(固定尺寸)用 panel
export function layoutOf(mode: PopupMode): Layout {
  return mode === 'settings' || mode === 'chapter' ? 'panel' : 'band'
}
