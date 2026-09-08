import { app, ipcMain } from 'electron'
import path from 'path'
import { PathLike } from 'node:fs'
import crypto from 'crypto'
import fs from 'fs'

// export const icon = icon
export const dataDir = path.resolve(app.getPath('userData'), '.alice')
export const configDir = path.join(dataDir, 'electron-conf')

export async function md5(path: PathLike): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fs.createReadStream(path)

    stream.on('data', (data) => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export function error(message: string): void {
  ipcMain.emit('error', { message })
}
