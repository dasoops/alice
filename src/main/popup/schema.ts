import type { Conf } from 'electron-conf'
import type { Config as ReaderConfig } from '../reader'
import type { Config as WebDavConfig } from '../webdav'
import type { Config as ShortcutConfig } from '../shortcut'
import type { SettingsData } from './types'

export type SettingsConfs = {
  reader: Conf<ReaderConfig>
  webdav: Conf<WebDavConfig>
  shortcut: Conf<ShortcutConfig>
}

export function readSettings(confs: SettingsConfs): SettingsData {
  const reader = confs.reader.store
  const webdav = confs.webdav.store
  const shortcut = confs.shortcut.store
  return {
    reader: {
      file: reader.file,
      chunkSize: reader.chunkSize,
      maxLine: reader.maxLine,
      txt: { chapterRegex: [...reader.txt.chapterRegex] },
      sync: { mode: reader.sync.mode }
    },
    webdav: {
      enabled: webdav.enabled,
      url: webdav.url,
      username: webdav.username,
      password: webdav.password,
      directory: webdav.directory
    },
    shortcut: {
      toggleDisplay: [...shortcut.toggleDisplay],
      toggleLock: [...shortcut.toggleLock],
      prevPage: [...shortcut.prevPage],
      nextPage: [...shortcut.nextPage],
      exit: [...shortcut.exit]
    }
  }
}

// 校验与规范化统一在渲染层完成, 主进程仅做透传回填;
// position 为运行状态, 不属于设置契约, 回填时从当前 store 保留
export function writeSettings(confs: SettingsConfs, patch: SettingsData): SettingsData {
  confs.reader.store = { ...patch.reader, position: confs.reader.store.position }
  confs.webdav.store = patch.webdav
  confs.shortcut.store = patch.shortcut
  return patch
}
