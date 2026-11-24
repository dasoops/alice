// 预设 CSS 放在 .css 文件, 构建期由 Vite 的 ?raw 内联为字符串(类似 go:embed)
import baseCss from './styles/default.css?raw'
import darculaCss from './styles/darcula.css?raw'

export type ReaderStyleCustom = {
  id: string
  name: string
  css: string
}

export type ReaderStyle = {
  // 当前启用的样式 id: 内置预设 id 或 customs 中的 id
  active: string
  // 按添加顺序展示
  customs: ReaderStyleCustom[]
}

export type ReaderStyleEntry = {
  id: string
  name: string
  css: string
  custom: boolean
}

// 与 main.css 的正文/正文角标规则保持一致, 选中该预设不改变现有观感
export const builtinReaderStyles: ReaderStyleEntry[] = [
  {
    id: 'default',
    name: '默认',
    css: baseCss,
    custom: false
  },
  {
    id: 'darcula',
    name: 'Darcula',
    // 深色文字视觉更重, 拉开字距降低信息密度; 角标仅在"跟随正文"时同步配色
    css: darculaCss,
    custom: false
  }
]

export function readerStyleEntries(style: ReaderStyle): ReaderStyleEntry[] {
  return [...builtinReaderStyles, ...style.customs.map((it) => ({ ...it, custom: true }))]
}

export function readerStyleEntry(style: ReaderStyle): ReaderStyleEntry {
  return readerStyleEntries(style).find((it) => it.id === style.active) ?? builtinReaderStyles[0]
}

export function readerStyleCss(style: ReaderStyle): string {
  return readerStyleEntry(style).css
}
