import { contextBridge, ipcRenderer } from 'electron'
import type { PopupInit, SettingsData } from '../main/popup/types'

const popup = {
  ready: (callback: (init: PopupInit) => void): void => {
    ipcRenderer.on('popup:init', (_event, init: PopupInit) => callback(init))
  },
  resolve: (payload: unknown): void => {
    ipcRenderer.send('popup:resolve', payload)
  },
  cancel: (): void => {
    ipcRenderer.send('popup:cancel')
  },
  // 内容超出初始高度时请求主进程增高
  resize: (height: number): void => {
    ipcRenderer.send('popup:resize', height)
  },
  configDir: (): Promise<string> => ipcRenderer.invoke('popup:config-dir'),
  settingsRead: (): Promise<SettingsData> => ipcRenderer.invoke('popup:settings:read'),
  settingsWrite: (patch: SettingsData): Promise<SettingsData> =>
    ipcRenderer.invoke('popup:settings:write', patch),
  pickFile: (options?: { title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('popup:settings:pick-file', options),
  // 主进程校验路径是否为存在的文件
  validateFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('popup:settings:validate-file', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('popup', popup)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.popup = popup
}
