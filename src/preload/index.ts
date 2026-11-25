import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Conf } from 'electron-conf/renderer'
import type { ChapterView, Config, ReaderStatus } from '../shared/reader'
import type { ReaderStyle } from '../shared/readerStyle'

// Custom APIs for renderer
const api = {
  toggleDisplay: (): void => ipcRenderer.send('toggle-display'),
  reader: {
    chapter: (): Promise<ChapterView> => ipcRenderer.invoke('reader:chapter'),
    moveChapter: (delta: -1 | 1): Promise<ChapterView> =>
      ipcRenderer.invoke('reader:moveChapter', delta),
    commitPosition: (
      chapterIndex: number,
      chapterPos: number,
      pageEnd: number
    ): Promise<ReaderStatus> =>
      ipcRenderer.invoke('reader:commitPosition', chapterIndex, chapterPos, pageEnd),
    fileName: (): Promise<string> => ipcRenderer.invoke('reader:fileName'),
    style: (): Promise<ReaderStyle> => ipcRenderer.invoke('reader:style')
  },
  conf: new Conf<Config>({ name: 'reader' })
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
