import { describe, expect, it, vi } from 'vitest'
import type { Config as ReaderConfig } from '../reader'
import { applySettings, readSettings, type SettingsConfs } from './schema'

// 假 conf 只需 store/get 两种能力, 便于脱离 electron-conf 与 electron 运行时验证写入归属
function setup(): { confs: SettingsConfs; readerStore: ReaderConfig } {
  const readerStore: ReaderConfig = {
    file: '/books/a.txt',
    position: { chapterIndex: 2, chapterPos: 10 },
    txt: { chapterRegex: [{ pattern: '^第', enabled: true }] },
    sync: { mode: 'approximate' },
    status: {
      enabled: true,
      corner: 'bottom-right',
      style: 'badge',
      formats: ['{chapter}'],
      formatIndex: 0
    },
    style: { active: 'default', customs: [] },
    recent: ['/books/a.txt']
  }
  const confs = {
    reader: { store: readerStore, get: (key: keyof ReaderConfig) => readerStore[key] },
    webdav: {
      store: { enabled: false, url: '', username: '', password: '', directory: 'legado' }
    },
    shortcut: {
      store: {
        toggleDisplay: ['Ctrl+Q'],
        toggleLock: ['Ctrl+P'],
        prevPage: ['Ctrl+1'],
        nextPage: ['Ctrl+E'],
        exit: ['Ctrl+3']
      }
    }
  }
  return { confs: confs as unknown as SettingsConfs, readerStore }
}

describe('applySettings', () => {
  it('webdav 与快捷键直接落盘, reader 配置交给 Reader 应用', async () => {
    const { confs } = setup()
    const applyReader = vi.fn().mockResolvedValue(undefined)
    const patch = readSettings(confs)
    patch.reader.file = '/books/b.txt'
    patch.webdav = {
      enabled: true,
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
      directory: 'legado'
    }
    patch.shortcut = { ...patch.shortcut, nextPage: ['Ctrl+2'] }

    await applySettings(confs, { applySettings: applyReader }, patch)

    expect(applyReader).toHaveBeenCalledTimes(1)
    expect(applyReader).toHaveBeenCalledWith(patch.reader)
    expect(confs.webdav.store).toEqual(patch.webdav)
    expect(confs.shortcut.store).toEqual(patch.shortcut)
  })

  it('不直接写 reader 配置, 文件与运行状态保持原值', async () => {
    const { confs, readerStore } = setup()
    const applyReader = vi.fn().mockResolvedValue(undefined)
    const patch = readSettings(confs)
    patch.reader = {
      ...patch.reader,
      file: '/books/b.txt',
      status: { ...patch.reader.status, enabled: false }
    }

    await applySettings(confs, { applySettings: applyReader }, patch)

    expect(readerStore.file).toBe('/books/a.txt')
    expect(readerStore.position).toEqual({ chapterIndex: 2, chapterPos: 10 })
    expect(readerStore.recent).toEqual(['/books/a.txt'])
    expect(readerStore.status.enabled).toBe(true)
  })

  it('返回回读的真实配置: 切书失败回滚后不是提交值', async () => {
    const { confs } = setup()
    // Reader 加载失败时不改 conf.file, 回读结果应反映实际落盘状态
    const applyReader = vi.fn().mockResolvedValue(undefined)
    const patch = readSettings(confs)
    patch.reader = { ...patch.reader, file: '/books/b.txt' }

    const saved = await applySettings(confs, { applySettings: applyReader }, patch)

    expect(saved.reader.file).toBe('/books/a.txt')
  })

  it('reader.style 返回副本, 修改面板草稿不会污染配置', () => {
    const { confs } = setup()
    const draft = readSettings(confs)
    draft.reader.style.active = 'darcula'
    draft.reader.style.customs.push({ id: 's1', name: '自定', css: '#content { color: red; }' })

    expect(readSettings(confs).reader.style).toEqual({ active: 'default', customs: [] })
  })
})
