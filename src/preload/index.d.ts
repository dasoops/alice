import { ElectronAPI } from '@electron-toolkit/preload'
import { Conf } from 'electron-conf'
import { Config, type ReadResult, type ReaderStatus } from '../main/reader/index'

interface Api {
  toggleDisplay: () => void
  reader: {
    read: (offset: number) => Promise<ReadResult>
    fileName: () => Promise<string>
    status: () => Promise<ReaderStatus>
  }
  conf: Conf<Config>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
