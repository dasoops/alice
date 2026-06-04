import { Conf } from 'electron-conf'
import * as fs from 'node:fs'
import { dataDir, error, lineSeparator, md5 } from '../util'
import path from 'path'
import { PathLike } from 'node:fs'
import log from 'electron-log/main'
import { BrowserWindow, ipcMain } from 'electron'

export type Config = {
  file: string
  index: number
  chunkSize: number
  maxLine: number
}

export const Config: { Default: Config } = {
  Default: { file: path.join(dataDir, 'read.txt'), index: 0, maxLine: 1, chunkSize: 40 }
}

function findNthIndex(str: string, char: string, skip: number): number {
  let count = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      if (count === skip) return i
      count++
    }
  }
  return -1
}

export class Reader {
  private readonly conf: Conf<Config>
  private readonly mainWindow: BrowserWindow
  private readonly cacheDir = path.join(dataDir, 'cache')
  private content?: string
  public cachePath?: string
  public initlization: Promise<void>

  constructor({ conf, mainWindow }: { conf: Conf<Config>; mainWindow: BrowserWindow }) {
    this.conf = conf
    this.mainWindow = mainWindow

    // ensure dir
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }

    this.initlization = this.init()
  }

  private async init(): Promise<void> {
    log.info(
      `Reader ==> init, conf: ${JSON.stringify(this.conf.store)}, cacheDir: ${this.cacheDir}`
    )

    this.content = await this.init0(this.conf.get('file'))

    this.conf.onDidChange('file', async (newValue) => {
      if (!newValue) throw Error('unexpected')
      // clear
      this.cachePath = undefined
      this.conf.set('index', 0)
      this.content = await this.init0(newValue as string)
      this.mainWindow.webContents.send('refresh-content')
    })
    ipcMain.handle('reader:read', async (_, offset: number): Promise<string> => {
      log.debug('on reader:read')
      return await this.read(offset)
    })
    log.info(`Reader <== init ok.`)
  }

  private async init0(filePath: PathLike): Promise<string> {
    // create hash
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '阅读文件不存在, 请配置.')
    const fileMd5 = await md5(filePath)
    const hashPath = path.resolve(this.cacheDir, `${fileMd5}.hash`)
    this.cachePath = path.resolve(this.cacheDir, `${fileMd5}.cache`)
    const result = (): string => {
      log.info(`Reader ==> open ${this.cachePath}`)
      return fs.readFileSync(this.cachePath!, 'utf-8')
    }

    const existsHash = fs.existsSync(hashPath)
    if (existsHash) {
      if (fileMd5 === fs.readFileSync(hashPath, 'utf-8')) return result()
    }
    fs.writeFileSync(hashPath, fileMd5, { encoding: 'utf-8' })

    // clear config
    this.conf.reset('index')

    // create cache file
    const readStream = fs.createReadStream(filePath, { encoding: 'utf-8' })
    const writeStream = fs.createWriteStream(this.cachePath)
    let currentLine = ''
    readStream.on('data', (chunk0: Buffer | string) => {
      const chunk = typeof chunk0 === 'string' ? chunk0 : chunk0.toString('utf-8')
      for (let i = 0; i < chunk.length; i++) {
        const it = chunk.charAt(i)

        if (it === '\r' || it === '\n') {
          if (currentLine.length > 0) {
            writeStream.write(currentLine + lineSeparator)
            currentLine = ''
            continue
          }
          continue
        }

        currentLine += it
      }
    })

    readStream.on('end', () => {
      if (currentLine.length !== 0) {
        writeStream.write(currentLine)
      }
      writeStream.end()
    })
    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(undefined))
      writeStream.on('error', reject)
      readStream.on('error', reject)
    })
    return result()
  }

  async read(offset: number): Promise<string> {
    await this.initlization
    const { chunkSize, index, maxLine } = this.conf.store
    const contentLength = this.content!.length
    log.debug(`Reader ==> index: ${index}`)

    const nextPage = (
      index: number,
      option?: { offset?: number; maxLine?: number; chunkSize?: number }
    ): number => {
      const offset0 = option?.offset ?? offset
      const maxLine0 = option?.maxLine ?? maxLine
      const chunkSize0 = option?.chunkSize ?? chunkSize

      const sign = offset0 === 0 ? 1 : Math.sign(offset0)
      let pageIndex = index
      let line = 0
      while (true) {
        if (line >= maxLine0) break
        if (Math.abs(pageIndex - index) >= chunkSize0) break
        const target = pageIndex + sign
        if (target < 0 || target > contentLength) break
        pageIndex = target

        const char = this.content![pageIndex]
        if (char === lineSeparator) line++
      }
      return pageIndex
    }

    // 指针为当前页文本头部, 初始化当前页 起始/结束索引
    let begin: number, end: number
    // 下一页 当前页结束 后翻一页
    if (offset > 0) {
      begin = nextPage(index)
      end = nextPage(begin)
      // 已达尾页
      if (begin === contentLength && end === contentLength) {
        // 从尾开始读一页
        begin = nextPage(contentLength, { offset: -1 })
      }
    }
    // 上一页 当前页起始 前翻一页
    else if (offset < 0) {
      begin = nextPage(index)
      end = index
      // 已达首页
      if (begin === 0 && end === 0) {
        // 从头开始读一页
        end = nextPage(0, { offset: 1 })
      }
    }
    // offset = 0
    else {
      begin = index
      end = nextPage(index)
    }
    const string = this.content!.substring(begin, end)
    log.debug(`Reader ==> ${begin}..${end} = ${string}`)
    this.conf.set('index', begin)

    return string
  }

  async currentLine(): Promise<number> {
    await this.initlization
    const index = this.conf.get('index')
    return this.content!.substring(0, index + 1).split(lineSeparator).length
  }

  async totalLine(): Promise<number> {
    await this.initlization
    return this.content!.split(lineSeparator).length
  }

  async jumpPage(value: number): Promise<void> {
    await this.initlization
    let index: number
    if (value === 1) {
      index = 0
    } else {
      // 第4行: 跳过前2个分隔符, 找到第3行末尾分隔符, +1即为第4行起始点
      index = findNthIndex(this.content!, lineSeparator, value - 2) + 1
    }
    if (index === -1) {
      error('指定行数不存在')
      return
    }

    this.conf.set('index', index)

    this.mainWindow.webContents.send('refresh-content')
  }
}
