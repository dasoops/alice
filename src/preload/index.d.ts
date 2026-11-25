import { ElectronAPI } from '@electron-toolkit/preload'
import { Conf } from 'electron-conf'
import type { ChapterView, Config, ReaderStatus } from '../shared/reader'
import type { ReaderStyle } from '../shared/readerStyle'

interface Api {
  toggleDisplay: () => void
  reader: {
    chapter: () => Promise<ChapterView>
    moveChapter: (delta: -1 | 1) => Promise<ChapterView>
    commitPosition: (
      chapterIndex: number,
      chapterPos: number,
      pageEnd: number
    ) => Promise<ReaderStatus>
    fileName: () => Promise<string>
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
