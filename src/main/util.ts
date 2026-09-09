import { app, ipcMain } from 'electron'
import path from 'path'

// export const icon = icon
export const dataDir = path.resolve(app.getPath('userData'), '.alice')
export const configDir = path.join(dataDir, 'electron-conf')

export function error(message: string): void {
  ipcMain.emit('error', { message })
}
