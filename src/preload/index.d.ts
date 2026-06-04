import { ElectronAPI } from '@electron-toolkit/preload'
import { ipcRenderer } from 'electron'
import { Conf } from 'electron-conf'
import { Config } from '../main/reader/index'

interface Api {
  toggleDisplay: () => void
  reader: {
    read: (offset: number) => Promise<string>
  }
  conf: Conf<Config>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
