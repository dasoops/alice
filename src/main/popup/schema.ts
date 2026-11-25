import type { Conf } from 'electron-conf'
import type { Config as ReaderConfig, Reader } from '../reader'
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
  // 数组单独解构处理, 避免引用传递
  return {
    reader: {
      file: reader.file,
      txt: { chapterRegex: reader.txt.chapterRegex.map((item) => ({ ...item })) },
      sync: { mode: reader.sync.mode },
      status: {
        ...reader.status,
        formats: [...reader.status.formats]
      },
      style: {
        active: reader.style.active,
        customs: reader.style.customs.map((item) => ({ ...item }))
      }
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

// 每类配置由所有者应用: webdav/shortcut 无缓存状态, 直写 conf 后由各自监听生效;
// reader 的 file 切换伴随解析/进度重置等副作用, 必须经 Reader 入口
export async function applySettings(
  confs: SettingsConfs,
  reader: Pick<Reader, 'applySettings'>,
  patch: SettingsData
): Promise<SettingsData> {
  confs.webdav.store = patch.webdav
  confs.shortcut.store = patch.shortcut
  await reader.applySettings(patch.reader)
  // 回读真实落盘值: 切书失败会回滚文件配置, 面板据此更新已保存基线
  return readSettings(confs)
}
