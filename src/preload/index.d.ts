import { ElectronAPI } from '@electron-toolkit/preload'
import { Conf } from 'electron-conf'
import type { Config, ReadResult, ReaderStatus } from '../shared/reader'
import type { ReaderStyle } from '../shared/readerStyle'

interface Api {
  toggleDisplay: () => void
  reader: {
    read: (offset: number) => Promise<ReadResult>
    fileName: () => Promise<string>
    status: () => Promise<ReaderStatus>
    style: () => Promise<ReaderStyle>
  }
  conf: Conf<Config>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
