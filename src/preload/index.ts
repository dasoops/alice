import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { Conf } from 'electron-conf/renderer'
import { Config } from '../main/reader'

// Custom APIs for renderer
const api = {
  toggleDisplay: (): void => ipcRenderer.send('toggle-display'),
  reader: {
    read: (offset: number): Promise<string> => ipcRenderer.invoke('reader:read', offset)
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
