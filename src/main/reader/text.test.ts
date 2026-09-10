import { describe, expect, it } from 'vitest'
import { lineSeparator } from '../constants'
import { normalizeText } from './text'

describe('normalizeText', () => {
  it('统一 \\r\\n 与孤立 \\r 为 lineSeparator', () => {
    expect(normalizeText('a\r\nb\rc\nd')).toBe(['a', 'b', 'c', 'd'].join(lineSeparator))
  })

  it('丢弃空行, 保留纯空白行', () => {
    expect(normalizeText('a\n\n \nb')).toBe(['a', ' ', 'b'].join(lineSeparator))
  })

  it('末行无分隔符, 末尾换行不产生空行', () => {
    expect(normalizeText('a\nb\n')).toBe(['a', 'b'].join(lineSeparator))
  })

  it('空串与纯换行归一化为空串', () => {
    expect(normalizeText('')).toBe('')
    expect(normalizeText('\n\r\n\r')).toBe('')
  })
})
