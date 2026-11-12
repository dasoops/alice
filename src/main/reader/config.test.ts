import { describe, expect, it, vi } from 'vitest'
import { normalizeTxtConfig } from './config'

// config 经 util 间接依赖 electron 的 app, 测试环境无 electron 运行时
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { emit: vi.fn() }
}))

describe('normalizeTxtConfig', () => {
  it('旧版字符串正则迁移为默认启用', () => {
    expect(normalizeTxtConfig({ chapterRegex: ['^第\\d+章'] })).toEqual({
      chapterRegex: [{ pattern: '^第\\d+章', enabled: true }]
    })
  })

  it('保留已带开关的结构', () => {
    const txt = { chapterRegex: [{ pattern: '^楔子', enabled: false }] }
    expect(normalizeTxtConfig(txt)).toEqual(txt)
  })

  it('缺少配置时返回空列表', () => {
    expect(normalizeTxtConfig(undefined)).toEqual({ chapterRegex: [] })
  })
})
