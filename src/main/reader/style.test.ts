import { describe, expect, it } from 'vitest'
import {
  builtinReaderStyles,
  readerStyleCss,
  readerStyleEntry,
  type ReaderStyle
} from '../../shared/readerStyle'

const emptyStyle: ReaderStyle = { active: 'default', customs: [] }

describe('readerStyle', () => {
  it('内置预设直接返回 CSS', () => {
    expect(readerStyleCss(emptyStyle)).toContain('#747474')
    expect(readerStyleCss({ ...emptyStyle, active: 'darcula' })).toContain('#a9b7c6')
  })

  it('自定义样式按 active id 解析', () => {
    const custom = { id: 's1', name: '夜间', css: '#content { color: #fff; }' }
    const style: ReaderStyle = { active: 's1', customs: [custom] }

    expect(readerStyleEntry(style)).toEqual({ ...custom, custom: true })
    expect(readerStyleCss(style)).toBe(custom.css)
  })

  it('未知 active 回退默认预设', () => {
    expect(readerStyleCss({ ...emptyStyle, active: 'gone' })).toBe(builtinReaderStyles[0].css)
  })
})
